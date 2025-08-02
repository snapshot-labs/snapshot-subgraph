import { BigInt, Bytes, BigDecimal, Address, ethereum } from '@graphprotocol/graph-ts'
import {
  Delegated,
  Undelegated,
  RestakedRewards,
  CreatedValidator,
  ChangedValidatorStatus,
  SFC
} from '../generated/SFC/SFC'
import {
  Stake,
  Validator,
  DeactivatedValidators
} from '../generated/schema'

function toBigDecimal(value: BigInt): BigDecimal {
  return value.toBigDecimal().div(BigDecimal.fromString('1000000000000000000'))
}

export function handleBlock(block: ethereum.Block): void {
  // Initialize all existing validators on first block only
  let contract = SFC.bind(Address.fromString('0xFC00FACE00000000000000000000000000000000'))
  let lastValidatorIDResult = contract.try_lastValidatorID()
  
  if (!lastValidatorIDResult.reverted) {
    let lastValidatorID = lastValidatorIDResult.value
    
    // Pre-populate validators 1 to lastValidatorID
    for (let i = 1; i <= lastValidatorID.toI32(); i++) {
      let validatorId = i.toString()
      let validator = Validator.load(validatorId)
      
      if (validator == null) {
        let callResult = contract.try_getValidator(BigInt.fromI32(i))
        if (!callResult.reverted) {
          validator = new Validator(validatorId)
          validator.address = callResult.value.value2 // auth field
          validator.totalDelegationReceived = BigDecimal.fromString('0')
          validator.status = callResult.value.value0 // status field
          validator.save()
        }
      }
    }
  }
}

function getOrCreateValidator(validatorId: string): Validator {
  let validator = Validator.load(validatorId)
  if (validator == null) {
    validator = new Validator(validatorId)
    validator.address = Bytes.fromHexString('0x0000000000000000000000000000000000000000')
    validator.totalDelegationReceived = BigDecimal.fromString('0')
    validator.status = BigInt.fromI32(0) // OK_STATUS
    validator.save()
  }
  return validator
}

function getOrCreateDeactivatedValidators(): DeactivatedValidators {
  let deactivatedValidators = DeactivatedValidators.load('deactivated')
  if (deactivatedValidators == null) {
    deactivatedValidators = new DeactivatedValidators('deactivated')
    deactivatedValidators.validatorIds = []
  }
  return deactivatedValidators
}

function updateDeactivatedValidatorsList(validatorId: string, isDeactivated: boolean): void {
  let deactivatedValidators = getOrCreateDeactivatedValidators()
  let validatorIds = deactivatedValidators.validatorIds
  let index = validatorIds.indexOf(validatorId)
  
  // Only save if the list actually changes
  if (isDeactivated && index == -1) {
    // Add to deactivated list if not already present
    validatorIds.push(validatorId)
    deactivatedValidators.validatorIds = validatorIds
    deactivatedValidators.save()
  } else if (!isDeactivated && index != -1) {
    // Remove from deactivated list if present
    validatorIds.splice(index, 1)
    deactivatedValidators.validatorIds = validatorIds
    deactivatedValidators.save()
  }
  // No save needed if no change occurred
}

function updateValidatorDelegation(validatorId: string, amount: BigDecimal, isAdd: boolean): void {
  let validator = getOrCreateValidator(validatorId)
  
  if (isAdd) {
    validator.totalDelegationReceived = validator.totalDelegationReceived.plus(amount)
  } else {
    validator.totalDelegationReceived = validator.totalDelegationReceived.minus(amount)
    if (validator.totalDelegationReceived.lt(BigDecimal.fromString('0'))) {
      validator.totalDelegationReceived = BigDecimal.fromString('0')
    }
  }
  
  validator.save()
}

function updateValidatorBalance(stake: Stake, validatorId: string, amountChange: BigDecimal, isAdd: boolean): void {
  let stakedTo = stake.stakedTo
  let found = false
  for (let i = 0; i < stakedTo.length; i++) {
    let parts = stakedTo[i].split(':')
    if (parts[0] == validatorId) {
      let currentBalance = BigDecimal.fromString(parts[1])
      let newBalance = isAdd ? currentBalance.plus(amountChange) : currentBalance.minus(amountChange)
      if (newBalance.gt(BigDecimal.fromString('0'))) {
        stakedTo[i] = validatorId + ':' + newBalance.toString()
      } else {
        stakedTo.splice(i, 1)
      }
      found = true
      break
    }
  }
  if (!found && isAdd && amountChange.gt(BigDecimal.fromString('0'))) {
    stakedTo.push(validatorId + ':' + amountChange.toString())
  }
  stake.stakedTo = stakedTo
}

export function handleDelegated(event: Delegated): void {
  let stakeEntity = Stake.load(event.params.delegator.toHex())
  if (stakeEntity == null) {
    stakeEntity = new Stake(event.params.delegator.toHex())
    stakeEntity.stakedTo = []
  }
  let amount = toBigDecimal(event.params.amount)
  let validatorId = event.params.toValidatorID.toString()
  
  // Update stake balance
  updateValidatorBalance(stakeEntity, validatorId, amount, true)
  stakeEntity.save()
  
  // Update validator delegation (this will save the validator)
  updateValidatorDelegation(validatorId, amount, true)
}

export function handleUndelegated(event: Undelegated): void {
  let stakeEntity = Stake.load(event.params.delegator.toHex())
  if (stakeEntity == null) {
    stakeEntity = new Stake(event.params.delegator.toHex())
    stakeEntity.stakedTo = []
  }
  let amount = toBigDecimal(event.params.amount)
  let validatorId = event.params.toValidatorID.toString()
  
  // Update stake balance
  updateValidatorBalance(stakeEntity, validatorId, amount, false)
  stakeEntity.save()
  
  // Update validator delegation (this will save the validator)
  updateValidatorDelegation(validatorId, amount, false)
}

export function handleRestakedRewards(event: RestakedRewards): void {
  let stakeEntity = Stake.load(event.params.delegator.toHex())
  if (stakeEntity == null) {
    stakeEntity = new Stake(event.params.delegator.toHex())
    stakeEntity.stakedTo = []
  }
  let rewards = toBigDecimal(event.params.rewards)
  let validatorId = event.params.toValidatorID.toString()
  
  // Update stake balance
  updateValidatorBalance(stakeEntity, validatorId, rewards, true)
  stakeEntity.save()
  
  // Update validator delegation (this will save the validator)
  updateValidatorDelegation(validatorId, rewards, true)
}

export function handleCreatedValidator(event: CreatedValidator): void {
  let validatorId = event.params.validatorID.toString()
  let validator = getOrCreateValidator(validatorId)
  // Always set the address from the event (most reliable source)
  validator.address = event.params.auth
  validator.save()
}

export function handleChangedValidatorStatus(event: ChangedValidatorStatus): void {
  let validatorId = event.params.validatorID.toString()
  let validator = getOrCreateValidator(validatorId)
  let newStatus = event.params.status
  
  // Only update and save if status actually changed
  if (!validator.status.equals(newStatus)) {
    validator.status = newStatus
    validator.save()
    
    let isDeactivated = !newStatus.equals(BigInt.fromI32(0))
    updateDeactivatedValidatorsList(validatorId, isDeactivated)
  }
}
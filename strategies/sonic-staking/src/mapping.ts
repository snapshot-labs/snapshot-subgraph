import { BigInt, Bytes, Address, ethereum } from '@graphprotocol/graph-ts'
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

function getOrCreateValidator(validatorId: string): Validator {
  let validator = Validator.load(validatorId)
  if (validator == null) {
    validator = new Validator(validatorId)
    let contract = SFC.bind(Address.fromString('0xFC00FACE00000000000000000000000000000000'))
    let callResult = contract.try_getValidator(BigInt.fromString(validatorId))
    if (!callResult.reverted) {
      validator.address = callResult.value.value2 // auth field
    } else {
      validator.address = Bytes.fromHexString('0x0000000000000000000000000000000000000000')
    }
    validator.totalDelegationReceived = BigInt.fromI32(0)
    validator.status = BigInt.fromI32(0) // OK_STATUS
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

function updateValidatorDelegation(validatorId: string, amountBigInt: BigInt, isAdd: boolean): void {
  let validator = getOrCreateValidator(validatorId)
  
  if (isAdd) {
    validator.totalDelegationReceived = validator.totalDelegationReceived.plus(amountBigInt)
  } else {
    validator.totalDelegationReceived = validator.totalDelegationReceived.minus(amountBigInt)
    if (validator.totalDelegationReceived.lt(BigInt.fromI32(0))) {
      validator.totalDelegationReceived = BigInt.fromI32(0)
    }
  }
  
  validator.save()
}

function updateValidatorBalance(stake: Stake, validatorId: string, amountBigInt: BigInt, isAdd: boolean): void {
  let stakedTo = stake.stakedTo
  let found = false
  
  for (let i = 0; i < stakedTo.length; i++) {
    let parts = stakedTo[i].split(':')
    if (parts[0] == validatorId) {
      // Work with BigInt for precise arithmetic (stored values are in wei)
      let currentBalanceBigInt = BigInt.fromString(parts[1])
      let newBalanceBigInt = isAdd ? currentBalanceBigInt.plus(amountBigInt) : currentBalanceBigInt.minus(amountBigInt)
      
      if (newBalanceBigInt.gt(BigInt.fromI32(0))) {
        // Store as BigInt string (wei) to avoid precision loss
        stakedTo[i] = validatorId + ':' + newBalanceBigInt.toString()
      } else {
        stakedTo.splice(i, 1)
      }
      found = true
      break
    }
  }
  if (!found && isAdd && amountBigInt.gt(BigInt.fromI32(0))) {
    // Store as BigInt string (wei) to avoid precision loss
    stakedTo.push(validatorId + ':' + amountBigInt.toString())
  }
  stake.stakedTo = stakedTo
}

export function handleDelegated(event: Delegated): void {
  let stakeEntity = Stake.load(event.params.delegator.toHex())
  if (stakeEntity == null) {
    stakeEntity = new Stake(event.params.delegator.toHex())
    stakeEntity.stakedTo = []
  }
  let amountBigInt = event.params.amount
  let validatorId = event.params.toValidatorID.toString()
  
  // Update stake balance
  updateValidatorBalance(stakeEntity, validatorId, amountBigInt, true)
  stakeEntity.save()
  
  // Update validator delegation (this will save the validator)
  updateValidatorDelegation(validatorId, amountBigInt, true)
}

export function handleUndelegated(event: Undelegated): void {
  let stakeEntity = Stake.load(event.params.delegator.toHex())
  if (stakeEntity == null) {
    return
  }
  let amountBigInt = event.params.amount
  let validatorId = event.params.toValidatorID.toString()
  
  // Update stake balance
  updateValidatorBalance(stakeEntity, validatorId, amountBigInt, false)
  stakeEntity.save()
  
  // Update validator delegation (this will save the validator)
  updateValidatorDelegation(validatorId, amountBigInt, false)
}

export function handleRestakedRewards(event: RestakedRewards): void {
  let stakeEntity = Stake.load(event.params.delegator.toHex())
  if (stakeEntity == null) {
    stakeEntity = new Stake(event.params.delegator.toHex())
    stakeEntity.stakedTo = []
  }
  let rewardsBigInt = event.params.rewards
  let validatorId = event.params.toValidatorID.toString()
  
  // Update stake balance
  updateValidatorBalance(stakeEntity, validatorId, rewardsBigInt, true)
  stakeEntity.save()
  
  // Update validator delegation (this will save the validator)
  updateValidatorDelegation(validatorId, rewardsBigInt, true)
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
import { BigInt, Bytes, BigDecimal, Address } from '@graphprotocol/graph-ts'
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

function getOrCreateValidator(validatorId: string): Validator {
  let validator = Validator.load(validatorId)
  if (validator == null) {
    validator = new Validator(validatorId)
    validator.address = Bytes.fromHexString('0x0000000000000000000000000000000000000000')
    validator.totalDelegationReceived = BigDecimal.fromString('0')
    validator.status = BigInt.fromI32(0) // OK_STATUS
    let contract = SFC.bind(Address.fromString('0xFC00FACE00000000000000000000000000000000'))
    let callResult = contract.try_getValidator(BigInt.fromString(validatorId))
    if (!callResult.reverted) {
      validator.address = callResult.value.value2 // auth field from contract
    }
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
  updateValidatorBalance(stakeEntity, event.params.toValidatorID.toString(), amount, true)
  stakeEntity.save()
  updateValidatorDelegation(event.params.toValidatorID.toString(), amount, true)
}

export function handleUndelegated(event: Undelegated): void {
  let stakeEntity = Stake.load(event.params.delegator.toHex())
  if (stakeEntity == null) {
    stakeEntity = new Stake(event.params.delegator.toHex())
    stakeEntity.stakedTo = []
  }
  let amount = toBigDecimal(event.params.amount)
  updateValidatorBalance(stakeEntity, event.params.toValidatorID.toString(), amount, false)
  stakeEntity.save()
  updateValidatorDelegation(event.params.toValidatorID.toString(), amount, false)
}

export function handleRestakedRewards(event: RestakedRewards): void {
  let stakeEntity = Stake.load(event.params.delegator.toHex())
  if (stakeEntity == null) {
    stakeEntity = new Stake(event.params.delegator.toHex())
    stakeEntity.stakedTo = []
  }
  let rewards = toBigDecimal(event.params.rewards)
  updateValidatorBalance(stakeEntity, event.params.toValidatorID.toString(), rewards, true)
  stakeEntity.save()
  updateValidatorDelegation(event.params.toValidatorID.toString(), rewards, true)
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
  validator.status = event.params.status
  validator.save()
  
  let isDeactivated = !event.params.status.equals(BigInt.fromI32(0))
  updateDeactivatedValidatorsList(validatorId, isDeactivated)
}
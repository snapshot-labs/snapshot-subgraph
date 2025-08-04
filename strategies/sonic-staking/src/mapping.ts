import { BigInt, Bytes, BigDecimal, Address, ethereum } from '@graphprotocol/graph-ts'
import {
  Delegated,
  Undelegated,
  CreatedValidator,
  ChangedValidatorStatus,
  SFC
} from '../generated/SFC/SFC'
import {
  Stake,
  Validator
} from '../generated/schema'

function toBigDecimal(value: BigInt): BigDecimal {
  return value.toBigDecimal().div(BigDecimal.fromString('1000000000000000000'))
}

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
    validator.totalDelegationReceived = BigDecimal.fromString('0')
    validator.status = BigInt.fromI32(0) // OK_STATUS
  }
  return validator
}

function updateValidatorDelegation(validatorId: string, amountBigInt: BigInt, isAdd: boolean): Validator {
  let validator = getOrCreateValidator(validatorId)
  
  // Work directly with BigDecimal
  let amountDecimal = toBigDecimal(amountBigInt)
  
  let newTotal: BigDecimal
  if (isAdd) {
    newTotal = validator.totalDelegationReceived.plus(amountDecimal)
  } else {
    newTotal = validator.totalDelegationReceived.minus(amountDecimal)
    if (newTotal.lt(BigDecimal.fromString('0'))) {
      newTotal = BigDecimal.fromString('0')
    }
  }
  
  validator.totalDelegationReceived = newTotal
  return validator
}

function updateValidatorBalance(stake: Stake, validatorId: string, amountBigInt: BigInt, isAdd: boolean): Stake {
  let stakedTo = stake.stakedTo
  let found = false
  let amountDecimal = toBigDecimal(amountBigInt)
  
  for (let i = 0; i < stakedTo.length; i++) {
    let parts = stakedTo[i].split(':')
    if (parts[0] == validatorId) {
      // Work directly with BigDecimal
      let currentBalanceDecimal = BigDecimal.fromString(parts[1])
      let newBalanceDecimal = isAdd ? currentBalanceDecimal.plus(amountDecimal) : currentBalanceDecimal.minus(amountDecimal)
      
      if (newBalanceDecimal.gt(BigDecimal.fromString('0'))) {
        stakedTo[i] = validatorId + ':' + newBalanceDecimal.toString()
      } else {
        stakedTo.splice(i, 1)
      }
      found = true
      break
    }
  }
  if (!found && isAdd && amountBigInt.gt(BigInt.fromI32(0))) {
    // Store as BigDecimal string for consistency
    stakedTo.push(validatorId + ':' + amountDecimal.toString())
  }
  stake.stakedTo = stakedTo
  return stake;
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
  stakeEntity = updateValidatorBalance(stakeEntity, validatorId, amountBigInt, true)
  
  // Update validator delegation and get the validator back
  let validator = updateValidatorDelegation(validatorId, amountBigInt, true)
  
  // Batch save both entities
  stakeEntity.save()
  validator.save()
}

export function handleUndelegated(event: Undelegated): void {
  let stakeEntity = Stake.load(event.params.delegator.toHex())
  if (stakeEntity == null) {
    return
  }
  let amountBigInt = event.params.amount
  let validatorId = event.params.toValidatorID.toString()
  
  // Update stake balance
  stakeEntity = updateValidatorBalance(stakeEntity, validatorId, amountBigInt, false)

  // Update validator delegation and get the validator back
  let validator = updateValidatorDelegation(validatorId, amountBigInt, false)
  
  // Batch save both entities
  stakeEntity.save()
  validator.save()
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
  }
}
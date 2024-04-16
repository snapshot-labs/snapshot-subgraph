import {
  ClearDelegate as ClearDelegateEvent,
  SetDelegate as SetDelegateEvent
} from "../generated/DelegateRegistry/DelegateRegistry"
import { ClearDelegate, SetDelegate } from "../generated/schema"

export function handleClearDelegate(event: ClearDelegateEvent): void {
  let entity = new ClearDelegate(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.delegator = event.params.delegator
  entity.DelegateRegistry_id = event.params.id
  entity.delegate = event.params.delegate

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleSetDelegate(event: SetDelegateEvent): void {
  let entity = new SetDelegate(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.delegator = event.params.delegator
  entity.DelegateRegistry_id = event.params.id
  entity.delegate = event.params.delegate

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

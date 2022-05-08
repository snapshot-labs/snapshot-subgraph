import { store, ethereum } from '@graphprotocol/graph-ts'
import { SetDelegate, ClearDelegate } from '../generated/DelegateRegistry/DelegateRegistry'
import { Block, Delegation } from '../generated/schema'

export function handleBlock(block: ethereum.Block): void {
  let id = block.hash.toHex()
  let blockEntity = new Block(id)
  blockEntity.number = block.number
  blockEntity.timestamp = block.timestamp
  blockEntity.save()
}

export function handleSetDelegate(event: SetDelegate): void {
  let delegator = event.params.delegator
  let space = event.params.id
  let delegate = event.params.delegate
  let id = delegator.toHex()
    .concat('-')
    .concat(space.toString())
    .concat('-')
    .concat(delegate.toHex())
  let delegation = new Delegation(id)
  delegation.delegator = delegator
  delegation.space = space.toString() || ''
  delegation.delegate = delegate
  delegation.timestamp = event.block.timestamp.toI32()
  delegation.save()
}

export function handleClearDelegate(event: ClearDelegate): void {
  let delegator = event.params.delegator
  let space = event.params.id
  let delegate = event.params.delegate
  let id = delegator.toHex()
    .concat('-')
    .concat(space.toString() || '')
    .concat('-')
    .concat(delegate.toHex())
  store.remove('Delegation', id);
}

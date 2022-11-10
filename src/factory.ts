import { Address } from '@graphprotocol/graph-ts'
import { ProxyCreation as ProxyCreation_v1_0_0 } from '../generated/GnosisSafeProxyFactory_v1_0_0/GnosisSafeProxyFactory'
import { ProxyCreation as ProxyCreation_v1_1_1 } from '../generated/GnosisSafeProxyFactory_v1_1_1/GnosisSafeProxyFactory'
import { ProxyCreation as ProxyCreation_v1_3_0 } from '../generated/GnosisSafeProxyFactory_v1_3_0/GnosisSafeProxyFactory'
import { GnosisSafe, SignMsg } from '../generated/templates/GnosisSafe/GnosisSafe'
import { GnosisSafe as GnosisSafeContract } from '../generated/templates'
import { Sig } from '../generated/schema'

function handleProxyCreation(proxyAddress: Address): void {
  let safeInstance = GnosisSafe.bind(proxyAddress)
  let callGetOwnerResult = safeInstance.try_getOwners()
  if (!callGetOwnerResult.reverted) GnosisSafeContract.create(proxyAddress)
}

export function handleProxyCreation_1_0_0(event: ProxyCreation_v1_0_0): void {
  handleProxyCreation(event.params.proxy)
}

export function handleProxyCreation_1_1_1(event: ProxyCreation_v1_1_1): void {
  handleProxyCreation(event.params.proxy)
}

export function handleProxyCreation_1_3_0(event: ProxyCreation_v1_3_0): void {
  handleProxyCreation(event.params.proxy)
}

export function handleSignMsg(event: SignMsg): void {
  let sig = new Sig(event.transaction.hash.toHexString())
  sig.account = event.address
  sig.msgHash = event.params.msgHash.toHex()
  sig.timestamp = event.block.timestamp
  sig.save()
}

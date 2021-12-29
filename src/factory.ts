import { ProxyCreation as ProxyCreation } from '../generated/GnosisSafeProxyFactory/GnosisSafeProxyFactory'
import { GnosisSafe, SignMsg } from '../generated/templates/GnosisSafe/GnosisSafe'
import { GnosisSafe as GnosisSafeContract } from '../generated/templates'
import { Sig } from '../generated/schema'

export function handleProxyCreation(event: ProxyCreation): void {
  let proxyAddress = event.params.proxy
  let safeInstance = GnosisSafe.bind(proxyAddress)
  let callGetOwnerResult = safeInstance.try_getOwners()
  if (!callGetOwnerResult.reverted) GnosisSafeContract.create(proxyAddress)
}

export function handleSignMsg(event: SignMsg): void {
  let sig = new Sig(event.transaction.hash.toHexString())
  sig.account = event.address
  sig.msgHash = event.params.msgHash.toHex()
  sig.timestamp = event.block.timestamp
  sig.save()
}

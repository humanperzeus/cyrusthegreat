import { http, createConfig } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { walletConnect } from 'wagmi/connectors'
import { WEB3_CONFIG } from '@/config/web3'

export const config = createConfig({
  chains: [sepolia],
  connectors: [
    walletConnect({ projectId: WEB3_CONFIG.REOWN_PROJECT_ID }),
  ],
  transports: {
    [sepolia.id]: http(WEB3_CONFIG.ALCHEMY_SEPOLIA_RPC_URL),
  },
})
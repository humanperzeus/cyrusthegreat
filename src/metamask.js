
export async function connectMetaMaskToEthMainnet() {
  if (typeof window.ethereum === 'undefined') {
    console.error('MetaMask is not installed or not detected.');
    return;
  }

  try {
    // Step 1: Request account access to activate/connect MetaMask
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    console.log('Connected accounts:', accounts);

    // Step 2: Try to switch to Ethereum Mainnet
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x1' }],
    });
    console.log('Successfully switched to Ethereum Mainnet.');
  } catch (error) {
    // If chain not added (error code 4902), add it
    if (error.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: '0x1',
              chainName: 'Ethereum Mainnet',
              nativeCurrency: {
                name: 'Ether',
                symbol: 'ETH',
                decimals: 18,
              },
              rpcUrls: ['https://rpc.ankr.com/eth'],
              blockExplorerUrls: ['https://etherscan.io'],
            },
          ],
        });
        console.log('Ethereum Mainnet added and switched.');
      } catch (addError) {
        console.error('Failed to add Ethereum Mainnet:', addError);
      }
    } else {
      console.error('Failed to switch to Ethereum Mainnet:', error);
    }
  }
}
export async function connectMetaMaskToEthTestnet() {
    if (typeof window.ethereum === 'undefined') {
      console.error('MetaMask is not installed or not detected.');
      return;
    }
  
    try {
      // Step 1: Request account access to activate/connect MetaMask
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      console.log('Connected accounts:', accounts);
  
      // Step 2: Try to switch to Ethereum Sepolia Testnet
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xaa36a7' }],
      });
      console.log('Successfully switched to Ethereum Sepolia Testnet.');
    } catch (error) {
      // If chain not added (error code 4902), add it
      if (error.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0xaa36a7',
                chainName: 'Sepolia Testnet',
                nativeCurrency: {
                  name: 'Sepolia ETH',
                  symbol: 'ETH',
                  decimals: 18,
                },
                rpcUrls: ['https://rpc.sepolia.org'],
                blockExplorerUrls: ['https://sepolia.etherscan.io'],
              },
            ],
          });
          console.log('Ethereum Sepolia Testnet added and switched.');
        } catch (addError) {
          console.error('Failed to add Ethereum Sepolia Testnet:', addError);
        }
      } else {
        console.error('Failed to switch to Ethereum Sepolia Testnet:', error);
      }
    }
}
export async function connectMetaMaskToBscMainnet() {
    if (typeof window.ethereum === 'undefined') {
      console.error('MetaMask is not installed or not detected.');
      return;
    }
  
    try {
      // Step 1: Request account access to activate/connect MetaMask
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      console.log('Connected accounts:', accounts);
  
      // Step 2: Try to switch to BNB Smart Chain Mainnet
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x38' }],
      });
      console.log('Successfully switched to BNB Smart Chain Mainnet.');
    } catch (error) {
      // If chain not added (error code 4902), add it
      if (error.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0x38',
                chainName: 'BNB Smart Chain Mainnet',
                nativeCurrency: {
                  name: 'BNB',
                  symbol: 'BNB',
                  decimals: 18,
                },
                rpcUrls: ['https://bsc-dataseed.binance.org'],
                blockExplorerUrls: ['https://bscscan.com'],
              },
            ],
          });
          console.log('BNB Smart Chain Mainnet added and switched.');
        } catch (addError) {
          console.error('Failed to add BNB Smart Chain Mainnet:', addError);
        }
      } else {
        console.error('Failed to switch to BNB Smart Chain Mainnet:', error);
      }
    }
}
export async function connectMetaMaskToBscTestnet() {
    if (typeof window.ethereum === 'undefined') {
      console.error('MetaMask is not installed or not detected.');
      return;
    }
  
    try {
      // Step 1: Request account access to activate/connect MetaMask
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      console.log('Connected accounts:', accounts);
  
      // Step 2: Try to switch to BSC Testnet (Chain ID 97, or 0x61 in hex)
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x61' }],
      });
      console.log('Successfully switched to BSC Testnet.');
    } catch (error) {
      // If chain not added (error code 4902), add it
      if (error.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0x61', // Hex for 97
                chainName: 'BNB Smart Chain Testnet',
                nativeCurrency: {
                  name: 'tBNB',
                  symbol: 'tBNB',
                  decimals: 18,
                },
                rpcUrls: ['https://data-seed-prebsc-1-s1.bnbchain.org:8545'], // Official RPC<grok-card data-id="b90c93" data-type="citation_card"></grok-card>
                blockExplorerUrls: ['https://testnet.bscscan.com'],
              },
            ],
          });
          console.log('BSC Testnet added and switched.');
        } catch (addError) {
          console.error('Failed to add BSC Testnet:', addError);
        }
      } else {
        console.error('Failed to switch to BSC Testnet:', error);
      }
    }
}
// connectMetaMaskToEthMainnet();
// connectMetaMaskToEthSepolia();
// connectMetaMaskToBscMainnet();
// connectMetaMaskToBscTestnet();
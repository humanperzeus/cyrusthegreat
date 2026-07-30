
export async function connectMetaMaskToEthMainnet() {
  console.log('🔧 connectMetaMaskToEthMainnet called');
  
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
    console.log('🔧 connectMetaMaskToEthTestnet called');
    
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
    console.log('🔧 connectMetaMaskToBscMainnet called');
    
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
  console.log('🔧 connectMetaMaskToBscTestnet called');
  
  if (typeof window.ethereum === 'undefined') {
    console.error('MetaMask is not installed or not detected.');
    return;
  }

  try {
    // Step 1: Request account access to activate/connect MetaMask
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    console.log('Connected accounts:', accounts);

    // Step 2: Try to switch to BSC Testnet
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
              chainId: '0x61',
              chainName: 'BSC Testnet',
              nativeCurrency: {
                name: 'tBNB',
                symbol: 'tBNB',
                decimals: 18,
              },
              rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545'],
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

// BASE Chain MetaMask Functions
export async function connectMetaMaskToBaseMainnet() {
  console.log('🔧 connectMetaMaskToBaseMainnet called');
  
  if (typeof window.ethereum === 'undefined') {
    console.error('MetaMask is not installed or not detected.');
    return;
  }

  try {
    // Step 1: Request account access to activate/connect MetaMask
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    console.log('Connected accounts:', accounts);

    // Step 2: Try to switch to BASE Mainnet
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x2105' }], // 8453 (BASE Mainnet)
    });
    console.log('Successfully switched to BASE Mainnet.');
  } catch (error) {
    // If chain not added (error code 4902), add it
    if (error.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: '0x2105',
              chainName: 'Base',
              nativeCurrency: {
                name: 'Ether',
                symbol: 'ETH',
                decimals: 18,
              },
              rpcUrls: ['https://mainnet.base.org'],
              blockExplorerUrls: ['https://basescan.org'],
            },
          ],
        });
        console.log('BASE Mainnet added and switched.');
      } catch (addError) {
        console.error('Failed to add BASE Mainnet:', addError);
      }
    } else {
      console.error('Failed to switch to BASE Mainnet:', error);
    }
  }
}

export async function connectMetaMaskToBaseTestnet() {
  console.log('🔧 connectMetaMaskToBaseTestnet called');
  
  if (typeof window.ethereum === 'undefined') {
    console.error('MetaMask is not installed or not detected.');
    return;
  }

  try {
    // Step 1: Request account access to activate/connect MetaMask
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    console.log('Connected accounts:', accounts);

    // Step 2: Try to switch to BASE Sepolia Testnet
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x14a34' }], // 84532 (BASE Sepolia)
    });
    console.log('Successfully switched to BASE Sepolia Testnet.');
  } catch (error) {
    // If chain not added (error code 4902), add it
    if (error.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: '0x14a34',
              chainName: 'Base Sepolia',
              nativeCurrency: {
                name: 'Sepolia Ether',
                symbol: 'ETH',
                decimals: 18,
              },
              rpcUrls: ['https://sepolia.base.org'],
              blockExplorerUrls: ['https://sepolia.basescan.org'],
            },
          ],
        });
        console.log('BASE Sepolia Testnet added and switched.');
      } catch (addError) {
        console.error('Failed to add BASE Sepolia Testnet:', addError);
      }
    } else {
      console.error('Failed to switch to BASE Sepolia Testnet:', error);
    }
  }
}
// connectMetaMaskToEthMainnet();
// connectMetaMaskToEthSepolia();
// connectMetaMaskToBscMainnet();
// connectMetaMaskToBscTestnet();
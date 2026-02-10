export interface WalletRecord {
  id: string
  publicKey: string
  label: string
  isMain: boolean
  encryptedKey: string // base64 of safeStorage-encrypted bytes
  createdAt: number
}

export interface WalletInfo {
  id: string
  publicKey: string
  label: string
  isMain: boolean
  balanceSol: number
  createdAt: number
}

export interface FundWalletParams {
  fromWalletId: string
  toWalletIds: string[]
  amountSolEach: number
}

export interface ReclaimParams {
  walletIds: string[]
  toWalletId: string
}

export interface ImportWalletParams {
  secretKeyBase58: string
  label: string
}

export interface GenerateWalletsParams {
  count: number
  labelPrefix: string
}

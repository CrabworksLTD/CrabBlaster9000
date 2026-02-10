import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  importWallet,
  generateWallets,
  listWalletsWithBalances,
  deleteWallet,
  fundWallets,
  reclaimWallets
} from '../services/wallet-manager'

const importSchema = z.object({
  secretKeyBase58: z.string().min(32),
  label: z.string().min(1).max(50)
})

const generateSchema = z.object({
  count: z.number().int().min(1).max(50),
  labelPrefix: z.string().min(1).max(30)
})

const fundSchema = z.object({
  fromWalletId: z.string().uuid(),
  toWalletIds: z.array(z.string().uuid()).min(1),
  amountSolEach: z.number().positive()
})

const reclaimSchema = z.object({
  walletIds: z.array(z.string().uuid()).min(1),
  toWalletId: z.string().uuid()
})

export function registerWalletIpc(): void {
  ipcMain.handle('wallet:import', async (_event, params: unknown) => {
    const validated = importSchema.parse(params)
    return importWallet(validated.secretKeyBase58, validated.label)
  })

  ipcMain.handle('wallet:generate', async (_event, params: unknown) => {
    const validated = generateSchema.parse(params)
    return generateWallets(validated.count, validated.labelPrefix)
  })

  ipcMain.handle('wallet:list', async () => {
    return listWalletsWithBalances()
  })

  ipcMain.handle('wallet:delete', async (_event, params: unknown) => {
    const { walletId } = z.object({ walletId: z.string().uuid() }).parse(params)
    deleteWallet(walletId)
  })

  ipcMain.handle('wallet:fund', async (_event, params: unknown) => {
    const validated = fundSchema.parse(params)
    const signatures = await fundWallets(
      validated.fromWalletId,
      validated.toWalletIds,
      validated.amountSolEach
    )
    return { success: true, signatures }
  })

  ipcMain.handle('wallet:reclaim', async (_event, params: unknown) => {
    const validated = reclaimSchema.parse(params)
    const signatures = await reclaimWallets(validated.walletIds, validated.toWalletId)
    return { success: true, signatures }
  })

  ipcMain.handle('wallet:refresh-balances', async () => {
    return listWalletsWithBalances()
  })
}

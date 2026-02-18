export interface PipelineStats {
  lastCycleAt: string | null
  totalPolls: number
  signaturesFetched: number
  failedTx: number
  parseError: number
  unknownDex: number
  noSwapDetected: number
  directionSkipped: number
  tradesDetected: number
  tradesReplicated: number
  tradesFailed: number
}

type CounterField = Exclude<keyof PipelineStats, 'lastCycleAt'>

const stats: PipelineStats = {
  lastCycleAt: null,
  totalPolls: 0,
  signaturesFetched: 0,
  failedTx: 0,
  parseError: 0,
  unknownDex: 0,
  noSwapDetected: 0,
  directionSkipped: 0,
  tradesDetected: 0,
  tradesReplicated: 0,
  tradesFailed: 0
}

function fmt(n: number): string {
  return n.toLocaleString('en-US')
}

const pipelineStats = {
  incr(field: CounterField): void {
    ;(stats[field] as number) += 1
  },

  incrBy(field: CounterField, n: number): void {
    ;(stats[field] as number) += n
  },

  setLastCycleAt(iso: string): void {
    stats.lastCycleAt = iso
  },

  reset(): void {
    stats.lastCycleAt = null
    stats.totalPolls = 0
    stats.signaturesFetched = 0
    stats.failedTx = 0
    stats.parseError = 0
    stats.unknownDex = 0
    stats.noSwapDetected = 0
    stats.directionSkipped = 0
    stats.tradesDetected = 0
    stats.tradesReplicated = 0
    stats.tradesFailed = 0
  },

  format(): string {
    const ts = stats.lastCycleAt ?? 'N/A'
    return (
      `🔧 <b>Pipeline Funnel</b> (last cycle @ ${ts})\n\n` +
      `Polls completed: ${fmt(stats.totalPolls)}\n` +
      `Signatures fetched: ${fmt(stats.signaturesFetched)}\n\n` +
      `--- FILTER BREAKDOWN ---\n` +
      `Failed tx:          ${fmt(stats.failedTx)}\n` +
      `Parse error:         ${fmt(stats.parseError)}\n` +
      `Unknown DEX:       ${fmt(stats.unknownDex)}\n` +
      `No swap detected:  ${fmt(stats.noSwapDetected)}\n` +
      `Direction skipped:  ${fmt(stats.directionSkipped)}\n\n` +
      `--- RESULTS ---\n` +
      `Trades detected:    ${fmt(stats.tradesDetected)}\n` +
      `Replicated:         ${fmt(stats.tradesReplicated)}\n` +
      `Failed:              ${fmt(stats.tradesFailed)}`
    )
  },

  getStats(): Readonly<PipelineStats> {
    return { ...stats }
  }
}

export function getPipelineStats(): typeof pipelineStats {
  return pipelineStats
}

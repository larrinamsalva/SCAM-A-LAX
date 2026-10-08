export const RADAR_LEVELS = [
  { id: 'LOW', label: 'Low concern', min: 1, max: 19, color: '#617b8a', next: 'A small number of warning points matched. Read the reason and verify the request before deciding.' },
  { id: 'ELEVATED', label: 'Caution', min: 20, max: 44, color: '#b48623', next: 'Warning signs deserve a closer look. Pause and read the matched reasons.' },
  { id: 'HIGH', label: 'High concern', min: 45, max: 69, color: '#c36529', next: 'Several warning points matched. Pause before acting and check the request through a contact you already trust.' },
  { id: 'CRITICAL', label: 'Very high concern', min: 70, max: 100, color: '#af3c4c', next: 'A strong combination of warning signs matched. Stop and review the next steps before responding.' },
]

export function radarReading(result) {
  if (!result?.findings?.length || !Number.isFinite(result.score)) return { id: 'UNKNOWN', label: 'Unknown · safety unverified', score: null, color: '#61717f', next: 'No configured warning patterns matched. A scam can still be present; check the request independently.' }
  const score = Math.min(100, Math.max(0, Math.round(result.score)))
  return { ...RADAR_LEVELS.find((level) => score <= level.max), score }
}

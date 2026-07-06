// Deterministic land travel cost from the travel_rates config table.
// Rate is chosen by one-way distance bracket; cost is round-trip × rate.
// All maths is code, never LLM (per project rules).

export interface TravelRates {
  road_per_km_0_500:    number // MYR/km for ≤ 500 km one-way
  road_per_km_over_500: number // MYR/km for > 500 km one-way
}

export interface LandCostResult {
  cost_myr:    number
  cost_note:   string
  cost_source: 'formula'
}

// Trainers within 150 km can make daily return trips → multiply by days.
// Beyond 150 km the trainer stays on-site for the duration → one round trip only.
const DAILY_RETURN_THRESHOLD_KM = 150

export function computeLandCost(
  distanceKm: number,
  rates: TravelRates,
  days = 1,
): LandCostResult {
  const rate        = distanceKm <= 500 ? rates.road_per_km_0_500 : rates.road_per_km_over_500
  const roundTripKm = distanceKm * 2
  const safeDays    = Math.max(1, Math.round(days))
  const applyDays   = distanceKm < DAILY_RETURN_THRESHOLD_KM
  const cost_myr    = Math.round(roundTripKm * rate * (applyDays ? safeDays : 1) * 100) / 100
  const cost_note   = applyDays && safeDays > 1
    ? `${roundTripKm.toFixed(1)} km round trip × RM${rate.toFixed(2)}/km × ${safeDays} days`
    : `${roundTripKm.toFixed(1)} km round trip × RM${rate.toFixed(2)}/km`
  return { cost_myr, cost_note, cost_source: 'formula' }
}

export function chooseTransportMode(
  accessibilityTier: string | null,
): 'Road' | 'Boat' | 'Flight' {
  if (accessibilityTier === 'boat')   return 'Boat'
  if (accessibilityTier === 'flight') return 'Flight'
  return 'Road'
}

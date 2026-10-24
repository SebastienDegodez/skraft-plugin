// Last known GPS position from the telematics provider.
export async function lastPosition(vehicleId) {
  const response = await fetch(`${process.env.TELEMATICS_URL}/v2/devices/${vehicleId}/position`, {
    headers: { authorization: `Bearer ${process.env.TELEMATICS_TOKEN}` },
  })
  return response.json()
}

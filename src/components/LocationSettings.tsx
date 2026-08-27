import PreciseLocationToggle, { type LocationPrecision } from './PreciseLocationToggle';
import { updateLocation, jitterToApprox } from '../utils/spacetime';
import { getBrowserLocation } from '../utils/geo';

export type { LocationPrecision } from './PreciseLocationToggle';

interface LocationSettingsProps {
  currentPrecision: LocationPrecision;
  onChanged: (precision: LocationPrecision) => void;
}

function LocationSettings({ currentPrecision, onChanged }: LocationSettingsProps) {
  return (
    <PreciseLocationToggle
      isExact={currentPrecision === 'exact'}
      onEnable={async () => {
        // Toggle ON: fetch a fresh precise location and send it
        const pos = await getBrowserLocation();
        await updateLocation(pos.lat, pos.lng, 'exact');
        onChanged('exact');
      }}
      onDisable={async () => {
        // Toggle OFF: no new fetch — the backend jitters the last stored precise location
        await jitterToApprox();
        onChanged('approx');
      }}
    />
  );
}

export default LocationSettings;

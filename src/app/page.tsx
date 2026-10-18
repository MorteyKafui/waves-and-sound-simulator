import { WaveLab } from "@/components/wave-lab";
import { buildTankArtwork } from "@/components/tank/art";

export default function Home() {
  return <WaveLab art={buildTankArtwork()} />;
}

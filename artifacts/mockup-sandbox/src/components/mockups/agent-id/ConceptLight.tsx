import { ConceptPage } from './_shared/concept/ConceptPage';

function LightHeroBackground() {
  return (
    <>
      {[280, 440, 600, 760, 920].map((size, i) => (
        <div key={i} style={{
          position: 'absolute',
          top: '50%', left: '50%',
          width: size, height: size,
          borderRadius: '50%',
          border: '1px solid rgba(0,0,0,0.03)',
          transform: 'translate(-50%, -50%)',
          animation: `concept-expand-circles 1.8s ease-out ${i * 180}ms forwards`,
          opacity: 0,
          pointerEvents: 'none',
        }} />
      ))}
    </>
  );
}

export default function ConceptLight() {
  return <ConceptPage theme="light" heroBackground={<LightHeroBackground />} />;
}

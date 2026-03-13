import { ConceptPage } from './_shared/concept/ConceptPage';

function DarkHeroBackground() {
  return (
    <>
      <div style={{
        position: 'absolute', top: '10%', left: '5%',
        width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(79,125,243,0.06) 0%, transparent 70%)',
        animation: 'concept-drift-1 25s ease-in-out infinite',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '5%', right: '0%',
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124,91,245,0.04) 0%, transparent 70%)',
        animation: 'concept-drift-2 30s ease-in-out infinite',
        pointerEvents: 'none',
      }} />
    </>
  );
}

export default function ConceptDark() {
  return <ConceptPage theme="dark" heroBackground={<DarkHeroBackground />} />;
}

export default function Loading() {
  return (
    <>
      <h1 className="skeleton" style={{ width: '60%', height: '32px', borderRadius: '8px', animation: 'pulse 1.5s infinite', backgroundColor: '#e2e8f0', marginBottom: '32px' }}></h1>
      <div style={{ width: '100%', height: '100%', paddingTop: '56.25%', position: 'relative', borderRadius: '12px', backgroundColor: '#f1f5f9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '32px' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid #cbd5e1', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <div style={{ color: '#64748b', fontSize: '14px', fontWeight: 500 }}>Đang tải bài học...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }`}</style>
      </div>
      <div className="skeleton" style={{ width: '100%', height: '16px', borderRadius: '4px', animation: 'pulse 1.5s infinite', backgroundColor: '#e2e8f0', marginBottom: '12px' }}></div>
      <div className="skeleton" style={{ width: '80%', height: '16px', borderRadius: '4px', animation: 'pulse 1.5s infinite', backgroundColor: '#e2e8f0', marginBottom: '32px' }}></div>
    </>
  )
}

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function Loading() {
    return (
        <>
            <div className="container">
                <Navbar activePage="pms-screener" />

                <div className="page-header">
                    <div className="page-eyebrow">
                        <div className="live-dot"></div>
                        <span className="page-eyebrow-text">Loading APMI Data...</span>
                    </div>
                    <h1 className="page-title">
                        PMS <span>Screener</span>
                    </h1>
                    <p className="page-subtitle">
                        Institutional-grade analytics for Portfolio Management Services.
                    </p>
                </div>

                <div className="type-filters" style={{ marginBottom: '24px' }}>
                    {[1, 2, 3].map((i) => (
                        <button key={i} className="type-btn" style={{ width: '80px', pointerEvents: 'none', opacity: 0.5 }}>...</button>
                    ))}
                </div>

                <div className="section pms-table-wrap">
                    <div className="table-wrap">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left' }}>Strategy / Manager</th>
                                    <th>AUM (Cr)</th>
                                    <th>1M%</th>
                                    <th>1Y%</th>
                                    <th>3Y%</th>
                                    <th style={{ textAlign: 'center' }}>1Y Alpha vs Nifty</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...Array(10)].map((_, i) => (
                                    <tr key={i}>
                                        <td style={{ textAlign: 'left', padding: '20px' }}>
                                            <div style={{ height: '14px', width: '240px', background: 'var(--s3)', borderRadius: '4px', marginBottom: '8px' }}></div>
                                            <div style={{ height: '10px', width: '160px', background: 'var(--s2)', borderRadius: '2px' }}></div>
                                        </td>
                                        <td><div style={{ height: '14px', width: '60px', background: 'var(--s3)', borderRadius: '4px', margin: '0 auto' }}></div></td>
                                        <td><div style={{ height: '14px', width: '40px', background: 'var(--s3)', borderRadius: '4px', margin: '0 auto' }}></div></td>
                                        <td><div style={{ height: '14px', width: '40px', background: 'var(--s3)', borderRadius: '4px', margin: '0 auto' }}></div></td>
                                        <td><div style={{ height: '14px', width: '40px', background: 'var(--s3)', borderRadius: '4px', margin: '0 auto' }}></div></td>
                                        <td>
                                            <div className="alpha-bar-container">
                                                <div style={{ height: '14px', width: '30px', background: 'var(--s3)', borderRadius: '4px' }}></div>
                                                <div style={{ height: '6px', width: '90px', background: 'var(--s2)', borderRadius: '4px' }}></div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
            <Footer />
        </>
    );
}
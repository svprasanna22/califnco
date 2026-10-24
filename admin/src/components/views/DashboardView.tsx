import {
  WaterDropIcon,
  OrdersIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
} from '../common/Icons';

export function DashboardView() {
  const stats = [
    {
      label: 'Connected Purifiers',
      value: '1,428',
      subtext: '98.4% IoT telemetry online',
      icon: <WaterDropIcon style={{ width: 20, height: 20 }} />,
      color: 'var(--cyan-primary)',
    },
    {
      label: 'Water Purified Today',
      value: '18,450 L',
      subtext: '+12% vs. 7-day average',
      icon: <CheckCircleIcon style={{ width: 20, height: 20 }} />,
      color: 'var(--teal-primary)',
    },
    {
      label: 'Pending Installations',
      value: '12',
      subtext: '4 scheduled for today',
      icon: <OrdersIcon style={{ width: 20, height: 20 }} />,
      color: 'var(--blue-primary)',
    },
    {
      label: 'Filter Replacement Due',
      value: '19',
      subtext: 'TDS alerts triggered',
      icon: <AlertTriangleIcon style={{ width: 20, height: 20 }} />,
      color: 'var(--amber-primary)',
    },
  ];

  const recentOrders = [
    {
      id: 'ORD-7291',
      customer: 'Priya Sharma',
      model: 'Califnco PurePro Alkaline RO+UV',
      city: 'Bengaluru, KA',
      amount: '₹18,499',
      status: 'Out for Installation',
      statusClass: 'status-info',
    },
    {
      id: 'ORD-7290',
      customer: 'Rahul Verma',
      model: 'Califnco HydroShield 8-Stage RO',
      city: 'Mumbai, MH',
      amount: '₹22,999',
      status: 'Installed & Verified',
      statusClass: 'status-success',
    },
    {
      id: 'ORD-7289',
      customer: 'Ananya Deshmukh',
      model: 'Alkaline Mineralizer Cartridge Pack',
      city: 'Pune, MH',
      amount: '₹2,499',
      status: 'Dispatched',
      statusClass: 'status-info',
    },
    {
      id: 'ORD-7288',
      customer: 'Karthik Raja',
      model: 'Califnco Smart Copper RO 10L',
      city: 'Chennai, TN',
      amount: '₹24,500',
      status: 'Payment Confirmed',
      statusClass: 'status-warning',
    },
  ];

  const serviceTickets = [
    {
      ticket: 'SRV-1042',
      type: 'Sediment & Carbon Filter Replacement',
      customer: 'Vikram Joshi',
      tds: '280 ppm (Alert)',
      technician: 'Arjun S. (Authorized Dealer)',
      status: 'Technician Assigned',
      statusClass: 'status-warning',
    },
    {
      ticket: 'SRV-1041',
      type: 'Annual Maintenance (AMC Check)',
      customer: 'Sneha Patel',
      tds: '65 ppm (Pure)',
      technician: 'Manoj Kumar',
      status: 'Completed',
      statusClass: 'status-success',
    },
    {
      ticket: 'SRV-1040',
      type: 'Post-Installation Water Quality Audit',
      customer: 'Deepak Roy',
      tds: '78 ppm (Pure)',
      technician: 'Ramesh Babu',
      status: 'Scheduled',
      statusClass: 'status-info',
    },
  ];

  return (
    <div className="animate-fade-in">
      <div className="stats-grid">
        {stats.map((stat, idx) => (
          <div key={idx} className="stat-card">
            <div className="stat-card-header">
              <span className="stat-label">{stat.label}</span>
              <div className="stat-icon-wrapper" style={{ color: stat.color, background: `${stat.color}15` }}>
                {stat.icon}
              </div>
            </div>
            <div className="stat-value">{stat.value}</div>
            <div className="stat-subtext">{stat.subtext}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24 }}>
        <div className="section-panel">
          <div className="section-panel-header">
            <h2 className="section-panel-title">Recent Customer Orders</h2>
            <span className="status-badge status-info">Live Stream</span>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Product</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{order.id}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{order.customer}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{order.city}</div>
                    </td>
                    <td>{order.model}</td>
                    <td style={{ fontWeight: 600, color: 'var(--cyan-primary)' }}>{order.amount}</td>
                    <td>
                      <span className={`status-badge ${order.statusClass}`}>
                        {order.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="section-panel">
          <div className="section-panel-header">
            <h2 className="section-panel-title">Purifier Service & Filter Tickets</h2>
            <span className="status-badge status-warning">TDS Monitoring</span>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Service Type</th>
                  <th>Customer</th>
                  <th>TDS Level</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {serviceTickets.map((ticket) => (
                  <tr key={ticket.ticket}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{ticket.ticket}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{ticket.type}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tech: {ticket.technician}</div>
                    </td>
                    <td>{ticket.customer}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{ticket.tds}</td>
                    <td>
                      <span className={`status-badge ${ticket.statusClass}`}>
                        {ticket.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

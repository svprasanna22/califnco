import { useState } from 'react';
import { AlertTriangleIcon } from '../common/Icons';

export function ServiceRequestsView() {
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'normal'>('all');

  const requests = [
    {
      id: 'SRV-8012',
      customer: 'Dr. Rajiv Nambiar',
      phone: '+91 94470 12345',
      purifierModel: 'Califnco PurePro Alkaline RO+UV',
      serviceType: 'TDS Spike Alert (> 250 ppm)',
      reportedAt: '1 hour ago',
      priority: 'high',
      technician: 'Santhosh M. (Assigned)',
      status: 'In Progress',
      statusClass: 'status-warning',
    },
    {
      id: 'SRV-8011',
      customer: 'Shalini Gupta',
      phone: '+91 98100 88776',
      purifierModel: 'Califnco HydroShield 8-Stage RO',
      serviceType: 'Pre-Filter & Carbon Block Replacement',
      reportedAt: '3 hours ago',
      priority: 'normal',
      technician: 'Vikas Sharma',
      status: 'Scheduled',
      statusClass: 'status-info',
    },
    {
      id: 'SRV-8010',
      customer: 'Harish Varma',
      phone: '+91 98490 55443',
      purifierModel: 'Califnco Smart Copper RO 10L',
      serviceType: 'Booster Pump Vibration Check',
      reportedAt: 'Yesterday',
      priority: 'normal',
      technician: 'K. Balakrishnan',
      status: 'Completed',
      statusClass: 'status-success',
    },
    {
      id: 'SRV-8009',
      customer: 'Pooja Agarwal',
      phone: '+91 99201 33221',
      purifierModel: 'Califnco PurePro Alkaline RO+UV',
      serviceType: 'Annual Maintenance (AMC 1st Service)',
      reportedAt: 'Yesterday',
      priority: 'normal',
      technician: 'Manoj Kumar',
      status: 'Completed',
      statusClass: 'status-success',
    },
  ];

  const filtered = priorityFilter === 'all' ? requests : requests.filter((r) => r.priority === priorityFilter);

  return (
    <div className="animate-fade-in">
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="stat-card">
          <span className="stat-label">Active Tickets</span>
          <div className="stat-value" style={{ color: 'var(--cyan-primary)' }}>14</div>
          <div className="stat-subtext">4 critical TDS anomalies</div>
        </div>
        <div className="stat-card">
          <span className="stat-label">Average Resolution Time</span>
          <div className="stat-value" style={{ color: 'var(--teal-primary)' }}>3.8 hrs</div>
          <div className="stat-subtext">Within 6-hour SLA guarantee</div>
        </div>
        <div className="stat-card">
          <span className="stat-label">Customer Satisfaction</span>
          <div className="stat-value" style={{ color: 'var(--amber-primary)' }}>98.2%</div>
          <div className="stat-subtext">Based on post-service audits</div>
        </div>
      </div>

      <div className="section-panel">
        <div className="section-panel-header" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 className="section-panel-title">Water Purifier Maintenance & Service Tickets</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              Telemetry-triggered filter alerts, scheduled AMC services, and customer breakdown support.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {(['all', 'high', 'normal'] as const).map((p) => (
              <button
                key={p}
                className="btn-secondary"
                style={{
                  background: priorityFilter === p ? 'var(--cyan-glow)' : undefined,
                  borderColor: priorityFilter === p ? 'var(--cyan-primary)' : undefined,
                  color: priorityFilter === p ? '#fff' : undefined,
                  textTransform: 'capitalize',
                  fontSize: 12,
                  height: 36,
                }}
                onClick={() => setPriorityFilter(p)}
              >
                {p === 'all' ? 'All Tickets' : `${p} Priority`}
              </button>
            ))}
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticket Ref</th>
                <th>Customer</th>
                <th>Purifier Model</th>
                <th>Service Issue</th>
                <th>Priority</th>
                <th>Assigned Field Tech</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ticket) => (
                <tr key={ticket.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{ticket.id}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{ticket.customer}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ticket.phone}</div>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{ticket.purifierModel}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{ticket.serviceType}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Logged {ticket.reportedAt}</div>
                  </td>
                  <td>
                    {ticket.priority === 'high' ? (
                      <span className="status-badge status-danger">
                        <AlertTriangleIcon style={{ width: 12, height: 12 }} />
                        High
                      </span>
                    ) : (
                      <span className="status-badge status-info">Normal</span>
                    )}
                  </td>
                  <td>{ticket.technician}</td>
                  <td>
                    <span className={`status-badge ${ticket.statusClass}`}>{ticket.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

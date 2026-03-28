import React, { useEffect, useState, useCallback } from 'react';
import { Row, Col, Card, Spinner, Alert } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiTrendingUp, FiUsers, FiBarChart2, FiCalendar, FiClock, FiCheck } from 'react-icons/fi';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../services/api';
import moment from 'moment-timezone';
import './AnalyticsPage.css';

const AnalyticsPage = () => {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [machines, setMachines] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    totalPatients: 0,
    newPatientsThisMonth: 0,
    activePatients: 0,
    inactivePatients: 0,
    totalMachines: 0,
    appointmentsThisMonth: 0,
    appointmentsCompleted: 0,
    appointmentsPending: 0,
    avgAppointmentsPerDay: 0,
    occupancyRate: 0,
    noShowRate: 0,
    cancellationRate: 0,
    completionRate: 0,
    adherenceRate: 0,
    machineAvailability: 0,
    appointmentsCancelled: 0,
    ageGroups: {
      '18-30': 0,
      '31-40': 0,
      '41-50': 0,
      '51-60': 0,
      '60+': 0
    },
    machineUtilization: []
  });

  const [selectedMachineId, setSelectedMachineId] = useState(null);

  const getAuthHeader = () => {
    const admin = JSON.parse(localStorage.getItem('admin'));
    const token = admin?.token;
    return { Authorization: `Bearer ${token}` };
  };

  const fetchPatients = useCallback(async () => {
    try {
      const res = await api.get('/patients', {
        headers: getAuthHeader()
      });
      const patientData = Array.isArray(res.data) ? res.data : res.data.data;
      setPatients(patientData);
    } catch (err) {
      console.error('Error fetching patients:', err);
      setError('Failed to load patient data');
    }
  }, []);

  const fetchMachines = useCallback(async () => {
    try {
      const response = await api.get('/machines', {
        headers: getAuthHeader()
      });
      setMachines(response.data || []);
    } catch (err) {
      console.error('Error fetching machines:', err);
      setError('Failed to load machine data');
    }
  }, []);

  const fetchAppointments = useCallback(async () => {
    try {
      const res = await api.get('/appointment-slots', {
        headers: getAuthHeader()
      });
      setAppointments(res.data || []);
    } catch (err) {
      console.error('Error fetching appointments:', err);
      setError('Failed to load appointment data');
    }
  }, []);

  const fetchAttendance = useCallback(async () => {
    try {
      const res = await api.get('/attendance', {
        headers: getAuthHeader()
      });
      setAttendance(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching attendance:', err);
    }
  }, []);

  const calculateStats = useCallback(() => {
    const now = moment().tz('Asia/Manila');
    const monthStart = moment().tz('Asia/Manila').startOf('month');
    const monthEnd = moment().tz('Asia/Manila').endOf('month');

    // Patient stats
    const newPatientsThisMonth = patients.filter(p => {
      const createdAt = moment(p.createdAt);
      return createdAt.isBetween(monthStart, monthEnd);
    }).length;

    const activePatients = patients.filter(p => !p.archived).length;
    const inactivePatients = patients.filter(p => p.archived).length;

    // Appointment stats
    const appointmentsThisMonth = appointments.filter(apt => {
      const aptDate = moment(apt.date);
      return aptDate.isBetween(monthStart, monthEnd);
    }).length;

    const appointmentsCompleted = appointments.filter(apt => {
      return apt.status === 'completed';
    }).length;

    const appointmentsPending = appointments.filter(apt => {
      return apt.status === 'pending' || apt.status === 'scheduled';
    }).length;

    const appointmentsCancelled = appointments.filter(apt => {
      return apt.status === 'cancelled';
    }).length;

    // Dialysis frequency and adherence metrics
    const noShowCount = attendance.filter(att => att.status === 'absent').length;
    const presentCount = attendance.filter(att => att.status === 'present').length;
    const totalAttendance = attendance.length;
    
    const noShowRate = totalAttendance > 0 ? Math.round((noShowCount / totalAttendance) * 100) : 0;
    const cancellationRate = appointmentsThisMonth > 0 ? Math.round((appointmentsCancelled / appointmentsThisMonth) * 100) : 0;
    const completionRate = appointments.length > 0 ? Math.round((appointmentsCompleted / appointments.length) * 100) : 0;
    const adherenceRate = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 0;
    const machineAvailability = machines.length > 0 ? Math.round((machines.filter(m => m.isActive).length / machines.length) * 100) : 0;

    // Average appointments per day (this month)
    const daysInMonth = now.daysInMonth();
    const avgAppointmentsPerDay = appointmentsThisMonth / daysInMonth;

    // Occupancy rate (completed appointments vs total appointments)
    const occupancyRate = appointments.length > 0 
      ? Math.round((appointmentsCompleted / appointments.length) * 100) 
      : 0;

    // Age demographics calculation
    const ageGroups = {
      '18-30': 0,
      '31-40': 0,
      '41-50': 0,
      '51-60': 0,
      '60+': 0
    };

    patients.forEach(patient => {
      if (patient.birthday) {
        const birthDate = moment(patient.birthday);
        const age = now.diff(birthDate, 'years');
        
        if (age >= 18 && age <= 30) ageGroups['18-30']++;
        else if (age >= 31 && age <= 40) ageGroups['31-40']++;
        else if (age >= 41 && age <= 50) ageGroups['41-50']++;
        else if (age >= 51 && age <= 60) ageGroups['51-60']++;
        else if (age > 60) ageGroups['60+']++;
      }
    });

    // Machine utilization calculation
    const todays = now.format('YYYY-MM-DD');
    const machineUtilization = machines.map(machine => {
      // Daily utilization
      const dailyAppointments = appointments.filter(apt => 
        apt.machine && apt.machine._id === machine._id && apt.date === todays && apt.isBooked
      ).length;
      const dailyUtilization = (dailyAppointments / 30) * 100; // 30 slots per day (15 morning + 15 afternoon)

      // Monthly utilization
      const monthlyAppointments = appointments.filter(apt => 
        apt.machine && apt.machine._id === machine._id && 
        moment(apt.date).isBetween(monthStart, monthEnd) && apt.isBooked
      ).length;
      const monthlyUtilization = (monthlyAppointments / (30 * 30)) * 100; // ~30 days * 30 slots per day

      return {
        _id: machine._id,
        name: machine.name,
        dailyUtilization: Math.round(dailyUtilization),
        monthlyUtilization: Math.round(monthlyUtilization),
        dailyAppointments,
        monthlyAppointments,
        isActive: machine.isActive
      };
    }).sort((a, b) => {
      const numA = parseInt(a.name.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.name.replace(/\D/g, '')) || 0;
      return numA - numB;
    });

    setStats({
      totalPatients: patients.length,
      newPatientsThisMonth,
      activePatients,
      inactivePatients,
      totalMachines: machines.length,
      appointmentsThisMonth,
      appointmentsCompleted,
      appointmentsPending,
      appointmentsCancelled,
      avgAppointmentsPerDay: avgAppointmentsPerDay.toFixed(1),
      occupancyRate,
      noShowRate,
      cancellationRate,
      completionRate,
      adherenceRate,
      machineAvailability,
      ageGroups,
      machineUtilization
    });
  }, [patients, machines, appointments, attendance]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        await Promise.all([fetchPatients(), fetchMachines(), fetchAppointments(), fetchAttendance()]);
      } catch (err) {
        console.error('Error loading analytics data:', err);
        setError('Failed to load analytics data');
      } finally {
        setLoading(false);
      }
    };
    loadData();
}, [fetchPatients, fetchMachines, fetchAppointments, fetchAttendance]);

  useEffect(() => {
    calculateStats();
  }, [calculateStats]);

  useEffect(() => {
    if (stats.machineUtilization.length > 0 && !selectedMachineId) {
      setSelectedMachineId(stats.machineUtilization[0]._id);
    }
  }, [stats.machineUtilization, selectedMachineId]);

  useEffect(() => {
    if (stats.machineUtilization.length > 0 && !selectedMachineId) {
      setSelectedMachineId(stats.machineUtilization[0]._id);
    }
  }, [stats.machineUtilization, selectedMachineId]);

  if (loading) {
    return (
      <div className="analytics-page">
        <div className="analytics-container">
          <div className="loading-container">
            <Spinner animation="border" variant="primary" />
            <p>Loading analytics data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-page">
      <div className="analytics-container">
        {/* Header with Back Button */}
        <div className="analytics-header">
          <button 
            className="back-button"
            onClick={() => navigate('/dashboard')}
            title="Go back to dashboard"
          >
            <FiArrowLeft size={20} />
            <span>Back</span>
          </button>
          <div className="header-content">
            <h1 className="analytics-title">Analytics & Insights</h1>
            <p className="analytics-subtitle">Comprehensive data insights and center performance metrics</p>
          </div>
        </div>

        {error && (
          <Alert variant="danger" className="analytics-alert">
            {error}
          </Alert>
        )}

        {/* Key Metrics Section */}
        <div className="metrics-section">
          <h2 className="section-title">Key Performance Metrics</h2>
          <Row className="metrics-grid">
            {/* Total Patients Card */}
            <Col lg={3} md={6} sm={12} className="metric-col">
              <Card className="metric-card">
                <Card.Body>
                  <div className="metric-icon patients-icon">
                    <FiUsers size={28} />
                  </div>
                  <div className="metric-content">
                    <h3 className="metric-value">{stats.totalPatients}</h3>
                    <p className="metric-label">Total Patients</p>
                    <p className="metric-subtext">+{stats.newPatientsThisMonth} this month</p>
                  </div>
                </Card.Body>
              </Card>
            </Col>

            {/* Total Machines Card */}
            <Col lg={3} md={6} sm={12} className="metric-col">
              <Card className="metric-card">
                <Card.Body>
                  <div className="metric-icon machines-icon">
                    <FiBarChart2 size={28} />
                  </div>
                  <div className="metric-content">
                    <h3 className="metric-value">{stats.totalMachines}</h3>
                    <p className="metric-label">Available Machines</p>
                    <p className="metric-subtext">All operational</p>
                  </div>
                </Card.Body>
              </Card>
            </Col>

            {/* Appointments This Month Card */}
            <Col lg={3} md={6} sm={12} className="metric-col">
              <Card className="metric-card">
                <Card.Body>
                  <div className="metric-icon appointments-icon">
                    <FiCalendar size={28} />
                  </div>
                  <div className="metric-content">
                    <h3 className="metric-value">{stats.appointmentsThisMonth}</h3>
                    <p className="metric-label">Appointments This Month</p>
                    <p className="metric-subtext">{stats.avgAppointmentsPerDay}/day avg</p>
                  </div>
                </Card.Body>
              </Card>
            </Col>

            {/* Occupancy Rate Card */}
            <Col lg={3} md={6} sm={12} className="metric-col">
              <Card className="metric-card">
                <Card.Body>
                  <div className="metric-icon occupancy-icon">
                    <FiTrendingUp size={28} />
                  </div>
                  <div className="metric-content">
                    <h3 className="metric-value">{stats.occupancyRate}%</h3>
                    <p className="metric-label">Occupancy Rate</p>
                    <p className="metric-subtext">Completion ratio</p>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </div>

        {/* Appointment Analytics Section */}
        <div className="analytics-section">
          <h2 className="section-title">Appointment Analytics</h2>
          <Row className="analytics-grid">
            {/* Completed Appointments */}
            <Col lg={4} md={6} sm={12} className="analytics-col">
              <Card className="analytics-card completed-card">
                <Card.Body>
                  <div className="analytics-icon">
                    <FiCheck size={24} />
                  </div>
                  <h3 className="analytics-card-title">Completed</h3>
                  <p className="analytics-card-value">{stats.appointmentsCompleted}</p>
                  <p className="analytics-card-description">Successfully completed appointments</p>
                </Card.Body>
              </Card>
            </Col>

            {/* Pending Appointments */}
            <Col lg={4} md={6} sm={12} className="analytics-col">
              <Card className="analytics-card pending-card">
                <Card.Body>
                  <div className="analytics-icon">
                    <FiClock size={24} />
                  </div>
                  <h3 className="analytics-card-title">Pending</h3>
                  <p className="analytics-card-value">{stats.appointmentsPending}</p>
                  <p className="analytics-card-description">Scheduled appointments waiting</p>
                </Card.Body>
              </Card>
            </Col>

            {/* Conversion Rate */}
            <Col lg={4} md={6} sm={12} className="analytics-col">
              <Card className="analytics-card conversion-card">
                <Card.Body>
                  <div className="analytics-icon">
                    <FiTrendingUp size={24} />
                  </div>
                  <h3 className="analytics-card-title">Conversion Rate</h3>
                  <p className="analytics-card-value">
                    {appointments.length > 0 
                      ? Math.round((stats.appointmentsCompleted / appointments.length) * 100) 
                      : 0}%
                  </p>
                  <p className="analytics-card-description">Appointment completion rate</p>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </div>

        {/* Age Demographic Section */}
        <div className="analytics-section">
          <h2 className="section-title">Patient Demographics - Age Distribution</h2>
          <Row>
            <Col lg={12} className="analytics-col">
              <Card className="age-demographics-card">
                <Card.Body>
                  <div className="age-chart-container">
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart
                        data={Object.entries(stats.ageGroups).map(([ageRange, count]) => ({
                          name: ageRange,
                          patients: count
                        }))}
                        margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(42, 63, 157, 0.1)" />
                        <XAxis 
                          dataKey="name" 
                          stroke="#6b7280"
                          style={{ fontSize: '0.9rem', fontWeight: '600' }}
                        />
                        <YAxis 
                          stroke="#6b7280"
                          style={{ fontSize: '0.9rem' }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                            border: '2px solid #2a3f9d',
                            borderRadius: '8px',
                            padding: '12px'
                          }}
                          labelStyle={{ color: '#1f2937', fontWeight: '700' }}
                          formatter={(value) => [`${value} patients`, 'Count']}
                        />
                        <Bar 
                          dataKey="patients" 
                          fill="#2a3f9d"
                          radius={[0, 8, 8, 0]}
                          animationDuration={800}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </div>

        {/* Patient Status Section */}
        <div className="analytics-section">
          <h2 className="section-title">Patient Status Overview</h2>
          <Row>
            <Col lg={6} md={12} className="analytics-col">
              <Card className="status-overview-card">
                <Card.Body>
                  <div className="status-overview-header">
                    <h3 className="status-overview-title">Active vs Inactive Patients</h3>
                  </div>
                  <div className="status-bars">
                    <div className="status-item-detailed">
                      <div className="status-label-row">
                        <span className="status-label">
                          <span className="status-dot active"></span>
                          Active Patients
                        </span>
                        <span className="status-count">{stats.activePatients}</span>
                      </div>
                      <div className="progress-bar-container">
                        <div className="progress-bar active-bar" style={{width: stats.totalPatients > 0 ? `${(stats.activePatients / stats.totalPatients) * 100}%` : '0%'}}></div>
                      </div>
                      <p className="status-percentage">{stats.totalPatients > 0 ? Math.round((stats.activePatients / stats.totalPatients) * 100) : 0}% of total</p>
                    </div>
                    <div className="status-item-detailed">
                      <div className="status-label-row">
                        <span className="status-label">
                          <span className="status-dot inactive"></span>
                          Inactive Patients
                        </span>
                        <span className="status-count">{stats.inactivePatients}</span>
                      </div>
                      <div className="progress-bar-container">
                        <div className="progress-bar inactive-bar" style={{width: stats.totalPatients > 0 ? `${(stats.inactivePatients / stats.totalPatients) * 100}%` : '0%'}}></div>
                      </div>
                      <p className="status-percentage">{stats.totalPatients > 0 ? Math.round((stats.inactivePatients / stats.totalPatients) * 100) : 0}% of total</p>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </Col>

            <Col lg={6} md={12} className="analytics-col">
              <Card className="patient-status-stats-card">
                <Card.Body>
                  <div className="patient-status-stat">
                    <div className="stat-icon active-icon">
                      <FiCheck size={24} />
                    </div>
                    <div className="stat-info">
                      <p className="stat-label">Active</p>
                      <p className="stat-value-large">{stats.activePatients}</p>
                      <p className="stat-description">Currently enrolled patients</p>
                    </div>
                  </div>
                  <div style={{margin: '1.5rem 0', backgroundColor: 'rgba(0,0,0,0.05)', height: '1px'}}></div>
                  <div className="patient-status-stat">
                    <div className="stat-icon inactive-icon">
                      <FiUsers size={24} />
                    </div>
                    <div className="stat-info">
                      <p className="stat-label">Inactive</p>
                      <p className="stat-value-large">{stats.inactivePatients}</p>
                      <p className="stat-description">Archived patients</p>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </div>

        {/* Patient Trends Section */}
        <div className="analytics-section">
          <h2 className="section-title">Patient Trends</h2>
          <Row>
            <Col lg={12}>
              <Card className="trends-card">
                <Card.Body>
                  <div className="trend-item">
                    <div className="trend-label">
                      <FiUsers size={20} />
                      <span>Active Patients</span>
                    </div>
                    <p className="trend-value">{patients.filter(p => p.isActive).length}</p>
                  </div>
                  <div className="trend-item">
                    <div className="trend-label">
                      <FiTrendingUp size={20} />
                      <span>New This Month</span>
                    </div>
                    <p className="trend-value">+{stats.newPatientsThisMonth}</p>
                  </div>
                  <div className="trend-item">
                    <div className="trend-label">
                      <FiBarChart2 size={20} />
                      <span>Total Registered</span>
                    </div>
                    <p className="trend-value">{stats.totalPatients}</p>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </div>

        {/* Machine Utilization Section */}
        <div className="analytics-section">
          <h2 className="section-title">Machine Utilization Analysis</h2>
          <Row>
            <Col lg={12} className="analytics-col">
              <Card className="machine-utilization-card">
                <Card.Body>
                  <div className="machine-selector-container">
                    <label className="machine-selector-label">Select Machine</label>
                    <select 
                      className="machine-selector-dropdown"
                      value={selectedMachineId || ''} 
                      onChange={(e) => setSelectedMachineId(e.target.value)}
                    >
                      {stats.machineUtilization.map((machine) => (
                        <option key={machine._id} value={machine._id}>
                          {machine.name} {machine.isActive ? '(Active)' : '(Inactive)'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedMachineId && stats.machineUtilization.length > 0 && (() => {
                    const selectedMachine = stats.machineUtilization.find(m => m._id === selectedMachineId);
                    return selectedMachine ? (
                      <div className="single-machine-display">
                        <div className="machine-header-detail">
                          <div className="machine-title-group">
                            <h3 className="machine-name-detail">{selectedMachine.name}</h3>
                            <span className={`status-badge ${selectedMachine.isActive ? 'active' : 'inactive'}`}>
                              {selectedMachine.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>

                        <div className="machine-metrics-grid">
                          <div className="machine-metric-card">
                            <div className="metric-header">
                              <p className="metric-label">Today's Utilization</p>
                              <span className="metric-icon">📅</span>
                            </div>
                            <div className="metric-content">
                              <div className="large-utilization-bar">
                                <div className="utilization-bar-background">
                                  <div 
                                    className="utilization-bar-fill" 
                                    style={{width: `${selectedMachine.dailyUtilization}%`}}
                                  ></div>
                                </div>
                              </div>
                              <div className="metric-footer">
                                <span className="large-percent">{selectedMachine.dailyUtilization}%</span>
                                <span className="metric-subtext">{selectedMachine.dailyAppointments} of 30 slots booked</span>
                              </div>
                            </div>
                          </div>

                          <div className="machine-metric-card">
                            <div className="metric-header">
                              <p className="metric-label">Monthly Utilization</p>
                              <span className="metric-icon">📊</span>
                            </div>
                            <div className="metric-content">
                              <div className="large-utilization-bar">
                                <div className="utilization-bar-background">
                                  <div 
                                    className="utilization-bar-fill" 
                                    style={{width: `${selectedMachine.monthlyUtilization}%`}}
                                  ></div>
                                </div>
                              </div>
                              <div className="metric-footer">
                                <span className="large-percent">{selectedMachine.monthlyUtilization}%</span>
                                <span className="metric-subtext">{selectedMachine.monthlyAppointments} appointments this month</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="machine-stats-detail">
                          <div className="stat-detail-item">
                            <span className="stat-detail-icon">⚙️</span>
                            <div className="stat-detail-content">
                              <p className="stat-detail-label">Daily Appointments</p>
                              <p className="stat-detail-value">{selectedMachine.dailyAppointments}</p>
                            </div>
                          </div>
                          <div className="stat-detail-item">
                            <span className="stat-detail-icon">📈</span>
                            <div className="stat-detail-content">
                              <p className="stat-detail-label">Monthly Appointments</p>
                              <p className="stat-detail-value">{selectedMachine.monthlyAppointments}</p>
                            </div>
                          </div>
                          <div className="stat-detail-item">
                            <span className="stat-detail-icon">🎯</span>
                            <div className="stat-detail-content">
                              <p className="stat-detail-label">Average Per Day</p>
                              <p className="stat-detail-value">{Math.round(selectedMachine.monthlyAppointments / 30)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </div>

        {/* Dialysis Frequency & Adherence Section */}
        <div className="analytics-section">
          <h2 className="section-title">Dialysis Frequency & Adherence Metrics</h2>
          <Row>
            {/* No-Show Rate */}
            <Col lg={3} md={6} sm={12} className="adherence-col">
              <Card className="adherence-card no-show-card">
                <Card.Body>
                  <div className="adherence-header">
                    <div className="adherence-icon no-show-icon">
                      ⚠️
                    </div>
                    <h3 className="adherence-card-title">No-Show Rate</h3>
                  </div>
                  <p className="adherence-card-value">{stats.noShowRate}%</p>
                  <p className="adherence-card-description">Missed scheduled appointments</p>
                  <div className="adherence-bar">
                    <div 
                      className="adherence-bar-fill no-show-fill"
                      style={{width: `${stats.noShowRate}%`}}
                    ></div>
                  </div>
                </Card.Body>
              </Card>
            </Col>

            {/* Cancellation Rate */}
            <Col lg={3} md={6} sm={12} className="adherence-col">
              <Card className="adherence-card cancellation-card">
                <Card.Body>
                  <div className="adherence-header">
                    <div className="adherence-icon cancellation-icon">
                      ❌
                    </div>
                    <h3 className="adherence-card-title">Cancellation Rate</h3>
                  </div>
                  <p className="adherence-card-value">{stats.cancellationRate}%</p>
                  <p className="adherence-card-description">Cancelled appointments</p>
                  <div className="adherence-bar">
                    <div 
                      className="adherence-bar-fill cancellation-fill"
                      style={{width: `${stats.cancellationRate}%`}}
                    ></div>
                  </div>
                </Card.Body>
              </Card>
            </Col>

            {/* Adherence Rate */}
            <Col lg={3} md={6} sm={12} className="adherence-col">
              <Card className="adherence-card adherence-card-highlight">
                <Card.Body>
                  <div className="adherence-header">
                    <div className="adherence-icon adherence-icon-success">
                      ✅
                    </div>
                    <h3 className="adherence-card-title">Adherence Rate</h3>
                  </div>
                  <p className="adherence-card-value">{stats.adherenceRate}%</p>
                  <p className="adherence-card-description">Actual attendances vs scheduled</p>
                  <div className="adherence-bar">
                    <div 
                      className="adherence-bar-fill adherence-fill"
                      style={{width: `${stats.adherenceRate}%`}}
                    ></div>
                  </div>
                </Card.Body>
              </Card>
            </Col>

            {/* Completion Rate */}
            <Col lg={3} md={6} sm={12} className="adherence-col">
              <Card className="adherence-card completion-card">
                <Card.Body>
                  <div className="adherence-header">
                    <div className="adherence-icon completion-icon">
                      🎯
                    </div>
                    <h3 className="adherence-card-title">Completion Rate</h3>
                  </div>
                  <p className="adherence-card-value">{stats.completionRate}%</p>
                  <p className="adherence-card-description">Successfully completed sessions</p>
                  <div className="adherence-bar">
                    <div 
                      className="adherence-bar-fill completion-fill"
                      style={{width: `${stats.completionRate}%`}}
                    ></div>
                  </div>
                </Card.Body>
              </Card>
            </Col>

            {/* Machine Availability */}
            <Col lg={3} md={6} sm={12} className="adherence-col">
              <Card className="adherence-card availability-card">
                <Card.Body>
                  <div className="adherence-header">
                    <div className="adherence-icon availability-icon">
                      ⚙️
                    </div>
                    <h3 className="adherence-card-title">Machine Availability</h3>
                  </div>
                  <p className="adherence-card-value">{stats.machineAvailability}%</p>
                  <p className="adherence-card-description">Operational machines</p>
                  <div className="adherence-bar">
                    <div 
                      className="adherence-bar-fill availability-fill"
                      style={{width: `${stats.machineAvailability}%`}}
                    ></div>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </div>

        {/* System Status */}
        <div className="analytics-section">
          <h2 className="section-title">System Status</h2>
          <Row>
            <Col lg={12}>
              <Card className="status-card">
                <Card.Body>
                  <div className="status-info">
                    <div className="status-item">
                      <div className="status-indicator success"></div>
                      <span>All Systems Operational</span>
                    </div>
                    <p className="status-details">Last updated: {moment().tz('Asia/Manila').format('MMMM D, YYYY h:mm A')}</p>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage;

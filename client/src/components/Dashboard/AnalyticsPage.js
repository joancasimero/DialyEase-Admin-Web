import React, { useEffect, useState, useCallback } from 'react';
import { Container, Row, Col, Card, Spinner, Alert } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiTrendingUp, FiUsers, FiBarChart3, FiCalendar, FiClock, FiCheck } from 'react-icons/fi';
import api from '../../services/api';
import moment from 'moment-timezone';
import './AnalyticsPage.css';

const AnalyticsPage = () => {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [machines, setMachines] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    totalPatients: 0,
    newPatientsThisMonth: 0,
    totalMachines: 0,
    appointmentsThisMonth: 0,
    appointmentsCompleted: 0,
    appointmentsPending: 0,
    avgAppointmentsPerDay: 0,
    occupancyRate: 0
  });

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
      const response = await api.get('/appointment-slots', {
        headers: getAuthHeader()
      });
      setAppointments(response.data || []);
    } catch (err) {
      console.error('Error fetching appointments:', err);
      setError('Failed to load appointment data');
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

    // Average appointments per day (this month)
    const daysInMonth = now.daysInMonth();
    const avgAppointmentsPerDay = appointmentsThisMonth / daysInMonth;

    // Occupancy rate (completed appointments vs total appointments)
    const occupancyRate = appointments.length > 0 
      ? Math.round((appointmentsCompleted / appointments.length) * 100) 
      : 0;

    setStats({
      totalPatients: patients.length,
      newPatientsThisMonth,
      totalMachines: machines.length,
      appointmentsThisMonth,
      appointmentsCompleted,
      appointmentsPending,
      avgAppointmentsPerDay: avgAppointmentsPerDay.toFixed(1),
      occupancyRate
    });
  }, [patients, machines, appointments]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        await Promise.all([fetchPatients(), fetchMachines(), fetchAppointments()]);
      } catch (err) {
        console.error('Error loading analytics data:', err);
        setError('Failed to load analytics data');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [fetchPatients, fetchMachines, fetchAppointments]);

  useEffect(() => {
    calculateStats();
  }, [calculateStats]);

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
                    <FiBarChart3 size={28} />
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
                      ? Math.round((appointmentsCompleted / appointments.length) * 100) 
                      : 0}%
                  </p>
                  <p className="analytics-card-description">Appointment completion rate</p>
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
                      <FiBarChart3 size={20} />
                      <span>Total Registered</span>
                    </div>
                    <p className="trend-value">{stats.totalPatients}</p>
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

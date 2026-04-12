import React, { useEffect, useState, useCallback } from 'react';
import { Row, Col, Card, Spinner, Alert } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiTrendingUp, FiUsers, FiBarChart2, FiCalendar, FiCheck } from 'react-icons/fi';
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
    machineUtilization: [],
    topHospitals: [],
    genderDistribution: {},
    comorbidities: []
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
      const now = moment().tz('Asia/Manila');
      let appointmentSlots = [];
      let fetchMethod = 'none';

      console.log('📅 Fetching appointments for month:', now.format('YYYY-MM'), '(M=', now.format('M'), ')');

      try {
        console.log('🔄 Trying bulk endpoint with month params...');
        const res = await api.get('/appointment-slots', {
          headers: getAuthHeader(),
          params: {
            month: now.format('M'),
            year: now.format('YYYY')
          }
        });
        appointmentSlots = Array.isArray(res.data) ? res.data : [];
        fetchMethod = 'bulk';
        
        const bookedCount = appointmentSlots.filter(apt => apt.isBooked).length;
        console.log(`✅ Bulk endpoint returned ${appointmentSlots.length} slots (${bookedCount} booked)`);
      } catch (primaryErr) {
        console.warn('❌ Primary bulk endpoint failed:', primaryErr.message);
      }

      // Fallback: use the same date endpoint powering Slot Tracker so analytics matches tracker data.
      if (appointmentSlots.length === 0 || appointmentSlots.filter(apt => apt.isBooked).length === 0) {
        console.log('⚠️ No booked slots from bulk endpoint, using per-date fallback (like Slot Tracker)...');
        const daysInMonth = now.daysInMonth();
        const dateRequests = [];

        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = now.clone().date(day).format('YYYY-MM-DD');
          dateRequests.push(
            api.get(`/appointment-slots/date/${dateStr}`, {
              headers: getAuthHeader()
            })
          );
        }

        const dateResults = await Promise.allSettled(dateRequests);

        appointmentSlots = dateResults.flatMap((result) => {
          if (result.status !== 'fulfilled') {
            return [];
          }

          const payload = result.value?.data || {};
          const morning = payload.morning || [];
          const afternoon = payload.afternoon || [];
          return [...morning, ...afternoon];
        });
        
        fetchMethod = 'per-date';
        const bookedCount = appointmentSlots.filter(apt => apt.isBooked).length;
        console.log(`✅ Per-date fallback returned ${appointmentSlots.length} total slots (${bookedCount} booked)`);
      }

      console.log(`🎯 Total appointments fetched (${fetchMethod}):`, appointmentSlots.length);
      if (appointmentSlots.length > 0) {
        const booked = appointmentSlots.filter(apt => apt.isBooked);
        console.log(`📌 Sample booked slots:`, booked.slice(0, 3).map(apt => ({
          date: apt.date,
          machine: apt.machine?.name,
          patient: apt.patient?.firstName,
          status: apt.status
        })));
      }
      
      setAppointments(appointmentSlots);
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

    const completedThisMonth = appointments.filter(apt => {
      const aptDate = moment(apt.date);
      return apt.status === 'completed' && aptDate.isBetween(monthStart, monthEnd);
    }).length;

    const pendingThisMonth = appointments.filter(apt => {
      const aptDate = moment(apt.date);
      return (apt.status === 'booked' || apt.status === 'pending' || apt.status === 'scheduled') && 
             aptDate.isBetween(monthStart, monthEnd);
    }).length;

    const appointmentsCompleted = appointments.filter(apt => {
      return apt.status === 'completed';
    }).length;

    const appointmentsPending = appointments.filter(apt => {
      return apt.status === 'booked' || apt.status === 'pending' || apt.status === 'scheduled';
    }).length;

    const appointmentsCancelled = appointments.filter(apt => {
      return apt.status === 'cancelled';
    }).length;

    console.log('📅 Appointment Status Breakdown:');
    console.log('  - Total appointments:', appointments.length);
    console.log('  - Completed:', appointmentsCompleted);
    console.log('  - Pending/Booked:', appointmentsPending);
    console.log('  - Cancelled:', appointmentsCancelled);
    console.log('  - This month - Completed:', completedThisMonth, 'Pending:', pendingThisMonth);
    console.log('  - Sample appointments:', appointments.slice(0, 3).map(apt => ({ date: apt.date, status: apt.status })));

    // Dialysis frequency and adherence metrics
    const noShowCount = attendance.filter(att => att.status === 'absent').length;
    const presentCount = attendance.filter(att => att.status === 'present').length;
    const totalAttendance = attendance.length;
    
    const noShowRate = totalAttendance > 0 ? Math.round((noShowCount / totalAttendance) * 100) : 0;
    const cancellationRate = appointmentsThisMonth > 0 ? Math.round((appointmentsCancelled / appointmentsThisMonth) * 100) : 0;
    const adherenceRate = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 0;
    const machineAvailability = machines.length > 0 ? Math.round((machines.filter(m => m.isActive).length / machines.length) * 100) : 0;

    // Average appointments per day (this month)
    const daysInMonth = now.daysInMonth();
    const avgAppointmentsPerDay = appointmentsThisMonth / daysInMonth;

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
    const monthPrefix = now.format('YYYY-MM-');
    const normalizeId = (value) => (value === null || value === undefined ? null : String(value));
    const normalizeMachineName = (value) => {
      if (!value) return null;
      return String(value).replace(/\s+/g, '').toLowerCase();
    };
    const getMachineId = (slot) => {
      if (!slot?.machine) return null;
      if (typeof slot.machine === 'string') return normalizeId(slot.machine);
      return normalizeId(slot.machine._id || slot.machine.id);
    };
    const getMachineName = (slot) => {
      if (!slot?.machine || typeof slot.machine !== 'object') return null;
      return normalizeMachineName(slot.machine.name);
    };
    const isSameDay = (slotDate, dayStr) => {
      const normalizedDate = String(slotDate || '');
      return normalizedDate.startsWith(dayStr);
    };
    const isInCurrentMonth = (slotDate) => {
      const normalizedDate = String(slotDate || '');
      if (normalizedDate.startsWith(monthPrefix)) {
        return true;
      }
      return moment(normalizedDate).isBetween(monthStart, monthEnd, undefined, '[]');
    };
    const isOccupiedSlot = (slot) => {
      return Boolean(slot?.isBooked || slot?.status === 'booked' || slot?.status === 'completed');
    };

    const dailyByMachineId = new Map();
    const dailyByMachineName = new Map();
    const monthlyByMachineId = new Map();
    const monthlyByMachineName = new Map();

    let occupiedCount = 0;
    let notOccupiedCount = 0;

    appointments.forEach((apt) => {
      if (!isOccupiedSlot(apt)) {
        notOccupiedCount++;
        return;
      }

      occupiedCount++;
      const machineId = getMachineId(apt);
      const machineName = getMachineName(apt);

      if (isSameDay(apt.date, todays)) {
        if (machineId) {
          dailyByMachineId.set(machineId, (dailyByMachineId.get(machineId) || 0) + 1);
        }
        if (machineName) {
          dailyByMachineName.set(machineName, (dailyByMachineName.get(machineName) || 0) + 1);
        }
      }

      if (isInCurrentMonth(apt.date)) {
        if (machineId) {
          monthlyByMachineId.set(machineId, (monthlyByMachineId.get(machineId) || 0) + 1);
        }
        if (machineName) {
          monthlyByMachineName.set(machineName, (monthlyByMachineName.get(machineName) || 0) + 1);
        }
      }
    });

    console.log('🔢 Appointments aggregation:');
    console.log('  - Occupied slots (booked/completed):', occupiedCount);
    console.log('  - Non-occupied slots:', notOccupiedCount);
    console.log('  - Daily by machine ID:', dailyByMachineId.size, 'machines with daily appointments');
    console.log('  - Monthly by machine ID:', monthlyByMachineId.size, 'machines with monthly appointments');
    console.log('  - Daily map:', Object.fromEntries(dailyByMachineId));
    console.log('  - Monthly map:', Object.fromEntries(monthlyByMachineId));

    // Calculate occupancy rate based on total capacity
    // Total slots = machines × 2 slots per day (morning + afternoon) × days in month
    const totalCapacity = machines.length > 0 ? machines.length * 2 * daysInMonth : 1;
    const occupancyRate = totalCapacity > 0 ? Math.round((occupiedCount / totalCapacity) * 100) : 0;
    console.log(`📊 Occupancy Rate: ${occupiedCount} occupied / ${totalCapacity} total capacity = ${occupancyRate}%`);

    const machineUtilization = machines.map(machine => {
      const machineId = normalizeId(machine._id);
      const machineName = normalizeMachineName(machine.name);

      const dailyAppointments =
        (machineId ? dailyByMachineId.get(machineId) : undefined) ||
        (machineName ? dailyByMachineName.get(machineName) : undefined) ||
        0;
      const dailyUtilization = (dailyAppointments / 30) * 100; // 30 slots per day (15 morning + 15 afternoon)

      const monthlyAppointments =
        (machineId ? monthlyByMachineId.get(machineId) : undefined) ||
        (machineName ? monthlyByMachineName.get(machineName) : undefined) ||
        0;
      
      // Each machine has 2 slots per day (1 morning + 1 afternoon) across the whole month
      const daysInMonth = now.daysInMonth(); // April = 30 days
      const slotsPerDay = 2; // 1 morning + 1 afternoon slot per machine per day
      const maxMonthlyCapacity = daysInMonth * slotsPerDay; // 60 slots max for April
      const monthlyUtilization = (monthlyAppointments / maxMonthlyCapacity) * 100;

      const util = {
        _id: machineId,
        name: machine.name,
        dailyUtilization: Math.round(dailyUtilization),
        monthlyUtilization: Math.round(monthlyUtilization),
        dailyAppointments,
        monthlyAppointments,
        isActive: machine.isActive
      };

      if (monthlyAppointments > 0) {
        console.log(`📊 ${machine.name}: ${monthlyAppointments} appointments / ${maxMonthlyCapacity} capacity = ${util.monthlyUtilization}%`);
      }

      return util;
    }).sort((a, b) => {
      const numA = parseInt(a.name.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.name.replace(/\D/g, '')) || 0;
      return numA - numB;
    });

    // Top 3 referral hospitals
    const hospitalCounts = {};
    patients.forEach(patient => {
      if (patient.hospital) {
        hospitalCounts[patient.hospital] = (hospitalCounts[patient.hospital] || 0) + 1;
      }
    });
    const topHospitals = Object.entries(hospitalCounts)
      .map(([hospital, count]) => ({
        hospital,
        count,
        percentage: patients.length > 0 ? Math.round((count / patients.length) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // Gender distribution calculation
    const genderDistribution = {};
    patients.forEach(patient => {
      if (patient.gender) {
        genderDistribution[patient.gender] = (genderDistribution[patient.gender] || 0) + 1;
      }
    });

    // Comorbidity extraction from medical history
    const comorbidityKeywords = {
      'Diabetes': ['diabetes', 'diabetic', 'dm', 'type 1', 'type 2'],
      'Hypertension': ['hypertension', 'high blood pressure', 'hbp'],
      'Heart Disease': ['heart disease', 'cardiac', 'heart failure', 'chf'],
      'Kidney Disease': ['kidney disease', 'ckd', 'chronic kidney'],
      'Anemia': ['anemia', 'anaemia', 'low hemoglobin'],
      'Bone Disease': ['bone disease', 'osteoporosis'],
      'Liver Disease': ['liver disease', 'hepatic', 'cirrhosis'],
      'Lung Disease': ['lung disease', 'asthma', 'copd']
    };

    const comorbidityMap = {};
    patients.forEach(patient => {
      if (patient.medicalHistory) {
        const history = patient.medicalHistory.toLowerCase();
        Object.entries(comorbidityKeywords).forEach(([condition, keywords]) => {
          if (keywords.some(keyword => history.includes(keyword))) {
            comorbidityMap[condition] = (comorbidityMap[condition] || 0) + 1;
          }
        });
      }
    });

    const comorbidities = Object.entries(comorbidityMap)
      .map(([condition, count]) => ({
        condition,
        count,
        percentage: patients.length > 0 ? Math.round((count / patients.length) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count);

    setStats({
      totalPatients: patients.length,
      newPatientsThisMonth,
      activePatients,
      inactivePatients,
      totalMachines: machines.length,
      appointmentsThisMonth,
      appointmentsCompleted: completedThisMonth,
      appointmentsPending: pendingThisMonth,
      appointmentsCancelled,
      avgAppointmentsPerDay: avgAppointmentsPerDay.toFixed(1),
      occupancyRate,
      noShowRate,
      cancellationRate,
      adherenceRate,
      machineAvailability,
      ageGroups,
      machineUtilization,
      topHospitals,
      genderDistribution,
      comorbidities
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
      const machineWithMonthlyData = stats.machineUtilization.find((m) => m.monthlyAppointments > 0);
      setSelectedMachineId((machineWithMonthlyData || stats.machineUtilization[0])._id);
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

        {/* Key Metrics Section */}
        <div className="metrics-section">
          <h2 className="section-title">Key Performance Metrics</h2>
          <div className="metrics-grid-simple">
            {/* Total Patients Card */}
            <div className="metric-box">
              <div className="metric-box-icon patients-icon">
                <FiUsers size={32} />
              </div>
              <div className="metric-box-value">{stats.totalPatients}</div>
              <div className="metric-box-label">Total Patients</div>
            </div>

            {/* Total Machines Card */}
            <div className="metric-box">
              <div className="metric-box-icon machines-icon">
                <FiBarChart2 size={32} />
              </div>
              <div className="metric-box-value">{stats.totalMachines}</div>
              <div className="metric-box-label">Available Machines</div>
            </div>

            {/* Appointments This Month Card */}
            <div className="metric-box">
              <div className="metric-box-icon appointments-icon">
                <FiCalendar size={32} />
              </div>
              <div className="metric-box-value">{stats.appointmentsThisMonth}</div>
              <div className="metric-box-label">Appointments</div>
            </div>

            {/* Occupancy Rate Card */}
            <div className="metric-box">
              <div className="metric-box-icon occupancy-icon">
                <FiTrendingUp size={32} />
              </div>
              <div className="metric-box-value">{stats.occupancyRate}%</div>
              <div className="metric-box-label">Occupancy Rate</div>
            </div>
          </div>
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
        <div className="analytics-section">
          <h2 className="section-title">Patient Demographics</h2>
          <Row>
            {/* Age Distribution */}
            <Col lg={6} md={12} className="analytics-col">
              <Card className="demographics-card">
                <Card.Body>
                  <h3 className="demographics-subtitle">Age Distribution</h3>
                  <div className="age-chart-container">
                    <ResponsiveContainer width="100%" height={300}>
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

            {/* Gender Distribution */}
            <Col lg={6} md={12} className="analytics-col">
              <Card className="demographics-card">
                <Card.Body>
                  <h3 className="demographics-subtitle">Gender Distribution</h3>
                  <div className="gender-stats">
                    {Object.entries(stats.genderDistribution).map(([gender, count]) => (
                      <div key={gender} className="gender-item">
                        <div className="gender-header">
                          <span className="gender-label">{gender}</span>
                          <span className="gender-count">{count}</span>
                        </div>
                        <div className="gender-bar">
                          <div 
                            className={`gender-bar-fill gender-${gender.toLowerCase().replace(/\\s+/g, '-')}`}
                            style={{width: `${(count / stats.totalPatients) * 100}%`}}
                          ></div>
                        </div>
                        <p className="gender-percentage">{stats.totalPatients > 0 ? Math.round((count / stats.totalPatients) * 100) : 0}%</p>
                      </div>
                    ))}
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </div>

        {/* Comorbidity Distribution Section */}
        <div className="analytics-section">
          <h2 className="section-title">Patient Comorbidities</h2>
          <Row>
            <Col lg={12} className="analytics-col">
              <Card className="comorbidity-card">
                <Card.Body>
                  <div className="comorbidity-list">
                    {stats.comorbidities.length > 0 ? (
                      stats.comorbidities.map((comorbidity, index) => (
                        <div key={comorbidity.condition} className="comorbidity-item">
                          <div className="comorbidity-header">
                            <span className="comorbidity-index">{index + 1}</span>
                            <span className="comorbidity-name">{comorbidity.condition}</span>
                            <span className="comorbidity-badge">{comorbidity.count} patients</span>
                          </div>
                          <div className="comorbidity-bar-container">
                            <div className="comorbidity-bar">
                              <div 
                                className="comorbidity-bar-fill"
                                style={{width: `${comorbidity.percentage}%`}}
                              ></div>
                            </div>
                            <span className="comorbidity-percentage">{comorbidity.percentage}%</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p style={{textAlign: 'center', color: '#9ca3af', padding: '2rem'}}>No comorbidity data available</p>
                    )}
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </div>

        {/* Top 3 Referral Hospitals Section */}
        <div className="analytics-section">
          <h2 className="section-title">Top 3 Referral Hospitals</h2>
          <Row>
            {stats.topHospitals.length > 0 ? (
              stats.topHospitals.map((hospital, index) => (
                <Col lg={4} md={6} sm={12} key={hospital.hospital} className="hospital-col">
                  <Card className="hospital-card">
                    <Card.Body>
                      <div className="hospital-rank">
                        <span className={`rank-badge rank-${index + 1}`}>{index + 1}</span>
                      </div>
                      <div className="hospital-content">
                        <h3 className="hospital-name">{hospital.hospital}</h3>
                        <p className="hospital-stat">
                          <span className="stat-label">Patients</span>
                          <span className="stat-number">{hospital.count}</span>
                        </p>
                        <div className="hospital-bar">
                          <div 
                            className="hospital-bar-fill"
                            style={{width: `${hospital.percentage}%`}}
                          ></div>
                        </div>
                        <p className="hospital-percentage">{hospital.percentage}% of total</p>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              ))
            ) : (
              <Col lg={12} className="analytics-col">
                <Card className="hospital-card">
                  <Card.Body style={{textAlign: 'center', padding: '2rem'}}>
                    <p style={{color: '#9ca3af', fontSize: '0.95rem'}}>No hospital data available</p>
                  </Card.Body>
                </Card>
              </Col>
            )}
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
      </div>
    </div>
  );
};

export default AnalyticsPage;

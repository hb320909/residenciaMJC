// --- Supabase setup ---
let supabaseConnected = false;
let supabaseClient = null;

async function initializeSupabase() {
    try {
        if (typeof window.supabase !== 'undefined' && window.supabase) {
            supabaseClient = window.supabase;
            const { data, error } = await supabaseClient.from('students').select('id').limit(1);
            if (error) {
                console.warn('Supabase connection test failed:', error.message);
                supabaseConnected = false;
            } else {
                console.log('Supabase connected successfully');
                supabaseConnected = true;
            }
        } else {
            console.warn('Supabase library not available');
            supabaseConnected = false;
        }
    } catch (e) {
        console.warn('Error initializing Supabase:', e.message);
        supabaseConnected = false;
    }
}


// Helper function to ensure DOM is ready
function onDOMReady(callback) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', callback);
    } else {
        callback();
    }
}

// Data storage
let students = [];
let absences = [];
let reports = [];
let homeworks = {};
let rooms = [];
let currentUser = '';
let currentSection = 'dashboard';

// User credentials
const users = {
    'Kati': 'sun12',
    'Alvaro': 'rock34',
    'Juan Ignacio': 'wiz56',
    'Maria Jose': 'moon78',
    'Jose Antonio': 'thun90',
    'Lourdes': 'rain21',
    'Ruben': 'comet43',
    'Belen': 'star65',
    'Adolfo': 'king999'
};

// --- Save/Load functions ---
async function saveData() {
    try {
        if (supabaseConnected && supabaseClient) {
            // Save students
            if (students.length > 0) {
                const { error } = await supabaseClient
                    .from('students')
                    .upsert(students, { onConflict: 'id' });
                if (error) console.warn('Error saving students:', error.message);
                else console.log('Students saved to Supabase');
            }

            // Save absences
            if (absences.length > 0) {
                const { error } = await supabaseClient
                    .from('absences')
                    .upsert(absences, { onConflict: 'id' });
                if (error) console.warn('Error saving absences:', error.message);
                else console.log('Absences saved to Supabase');
            }

            // Save reports
            if (reports.length > 0) {
                const { error } = await supabaseClient
                    .from('reports')
                    .upsert(reports, { onConflict: 'id' });
                if (error) console.warn('Error saving reports:', error.message);
                else console.log('Reports saved to Supabase');
            }
        }

        // Always save to localStorage as backup
        localStorage.setItem('students', JSON.stringify(students));
        localStorage.setItem('absences', JSON.stringify(absences));
        localStorage.setItem('reports', JSON.stringify(reports));
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

async function getStudents() {
    return students || [];
}

async function addStudent(alumno) {
    const student = {
        id: Date.now(),
        nombre: alumno.nombre,
        apellidos: alumno.apellidos || '',
        curso: alumno.curso || '',
        telefono1: alumno.telefono || '',
        telefono2: '',
        fechaNacimiento: '',
        gender: 'otro',
        habitacion: null,
        cama: null
    };
    students.push(student);
    
    // Save to Supabase immediately
    if (supabaseConnected && supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('students')
                .insert([student]);
            if (error) {
                console.warn('Error adding student to Supabase:', error.message);
            } else {
                console.log('Student saved to Supabase');
            }
        } catch (error) {
            console.error('Error:', error);
        }
    } else {
        console.log('Student added to memory (will sync on next connection)');
    }
    
    return student;
}

// Setup real-time subscriptions for students
function setupRealtimeSubscriptions() {
    try {
        // Subscribe to students changes
        supabase
            .channel('public:students')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'students' },
                (payload) => {
                    console.log('Students update:', payload);
                    if (payload.eventType === 'INSERT') {
                        const student = payload.new;
                        if (!students.find(s => s.id === student.id)) {
                            students.push(student);
                        }
                    } else if (payload.eventType === 'UPDATE') {
                        const idx = students.findIndex(s => s.id === payload.new.id);
                        if (idx >= 0) {
                            students[idx] = payload.new;
                        }
                    } else if (payload.eventType === 'DELETE') {
                        students = students.filter(s => s.id !== payload.old.id);
                    }
                    updateStudentsTable();
                    updateDashboard();
                    populateDropdowns();
                }
            )
            .subscribe();

        // Subscribe to absences changes
        supabase
            .channel('public:absences')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'absences' },
                (payload) => {
                    console.log('Absences update:', payload);
                    if (payload.eventType === 'INSERT') {
                        if (!absences.find(a => a.id === payload.new.id)) {
                            absences.push(payload.new);
                        }
                    } else if (payload.eventType === 'UPDATE') {
                        const idx = absences.findIndex(a => a.id === payload.new.id);
                        if (idx >= 0) {
                            absences[idx] = payload.new;
                        }
                    } else if (payload.eventType === 'DELETE') {
                        absences = absences.filter(a => a.id !== payload.old.id);
                    }
                    updateAbsencesTable();
                    updateDashboard();
                }
            )
            .subscribe();

        // Subscribe to reports changes
        supabase
            .channel('public:reports')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'reports' },
                (payload) => {
                    console.log('Reports update:', payload);
                    if (payload.eventType === 'INSERT') {
                        if (!reports.find(r => r.id === payload.new.id)) {
                            reports.push(payload.new);
                        }
                    } else if (payload.eventType === 'UPDATE') {
                        const idx = reports.findIndex(r => r.id === payload.new.id);
                        if (idx >= 0) {
                            reports[idx] = payload.new;
                        }
                    } else if (payload.eventType === 'DELETE') {
                        reports = reports.filter(r => r.id !== payload.old.id);
                    }
                    updateReportsTable();
                    updateDashboard();
                }
            )
            .subscribe();
    } catch (error) {
        console.error('Error setting up subscriptions:', error);
    }
}

// Initialize rooms
function initializeRooms() {
    // Estructura de habitaciones:
    // Planta 1: Hombres 101-104 (izq), Mujeres 201-202 (der)
    // Planta 2: Hombres 201-204 (izq), Mujeres 301-304 (der)
    // Cada habitación tiene 6 camas: A, B, C, D, E, F
    rooms = [];
    
    const bedLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
    
    const createRooms = (startNum, endNum, gender, floor, side) => {
        for (let i = startNum; i <= endNum; i++) {
            const number = `${i}`;
            const beds = {};
            bedLetters.forEach(letter => {
                beds[letter] = null; // null significa cama vacía
            });
            
            rooms.push({ 
                number, 
                capacity: 6, 
                occupied: 0, 
                beds: beds, // estructura: { A: studentId/null, B: studentId/null, ... }
                type: 'para 6', 
                gender: gender, 
                floor: floor,
                side: side
            });
        }
    };
    
    // Planta 1 - Hombres (101-104)
    createRooms(101, 104, 'hombre', 1, 'izquierda');
    
    // Planta 1 - Mujeres (201-202)
    createRooms(201, 202, 'mujer', 1, 'derecha');
    
    // Planta 2 - Hombres (211-214)
    createRooms(211, 214, 'hombre', 2, 'izquierda');
    
    // Planta 2 - Mujeres (301-304)
    createRooms(301, 304, 'mujer', 2, 'derecha');
}

// Utility: calculate age in years from a YYYY-MM-DD date string
function calculateAge(dateString) {
    if (!dateString) return null;
    const today = new Date();
    const birth = new Date(dateString);
    if (isNaN(birth)) return null;
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

// Check for birthdays today
function checkBirthdays() {
    const today = new Date();
    const currentMonth = today.getMonth() + 1; // 1-12
    const currentDay = today.getDate();
    
    const birthdayStudents = students.filter(student => {
        if (!student.fechaNacimiento) return false;
        const birthDate = new Date(student.fechaNacimiento + 'T00:00:00');
        if (isNaN(birthDate)) return false;
        
        const birthMonth = birthDate.getMonth() + 1;
        const birthDay = birthDate.getDate();
        
        return birthMonth === currentMonth && birthDay === currentDay;
    });
    
    if (birthdayStudents.length > 0) {
        showBirthdayModal(birthdayStudents);
    }
}

function showBirthdayModal(students) {
    const modal = document.getElementById('birthdayModal');
    const message = document.getElementById('birthdayMessage');
    
    if (students.length === 1) {
        message.textContent = `Hoy es el cumpleaños de ${students[0].nombre}`;
    } else {
        const names = students.map(s => s.nombre).join(', ');
        message.textContent = `¡Hoy es el cumpleaños de ${names}!`;
    }
    
    modal.classList.remove('hidden');
    
    // Create confetti animation
    createConfetti();
    
    // Auto-close after 6 seconds
    setTimeout(() => {
        closeBirthdayModal();
    }, 6000);
}

function closeBirthdayModal() {
    const modal = document.getElementById('birthdayModal');
    modal.classList.add('hidden');
}

function createConfetti() {
    const container = document.getElementById('confettiContainer');
    if (!container) return;
    
    // Clear previous confetti
    container.innerHTML = '';
    
    const confettiPieces = 50;
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE'];
    
    for (let i = 0; i < confettiPieces; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece absolute w-2 h-2 rounded-full';
        piece.style.left = Math.random() * 100 + '%';
        piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDelay = (Math.random() * 0.5) + 's';
        piece.style.opacity = '0.8';
        container.appendChild(piece);
    }
}

/// --- Global variables ---
// Note: students, absences, reports, homeworks are already declared at the top of the file

// --- Load data from Supabase ---
async function loadData() {
    try {
        let loadedFromSupabase = false;
        
        if (supabaseConnected && supabaseClient) {
            console.log('Loading data from Supabase...');
            
            // Fetch students
            const { data: studentsData, error: studentsError } = await supabaseClient
                .from('students')
                .select('*');
            if (!studentsError) {
                students = studentsData || [];
                loadedFromSupabase = true;
                console.log('Loaded students from Supabase:', students.length);
            }

            // Fetch absences
            const { data: absencesData, error: absencesError } = await supabaseClient
                .from('absences')
                .select('*');
            if (!absencesError) {
                absences = absencesData || [];
                console.log('Loaded absences from Supabase:', absences.length);
            }

            // Fetch reports
            const { data: reportsData, error: reportsError } = await supabaseClient
                .from('reports')
                .select('*');
            if (!reportsError) {
                reports = reportsData || [];
                console.log('Loaded reports from Supabase:', reports.length);
            }
        } else {
            console.log('Loading from localStorage (Supabase not connected)');
        }
        
        // Fallback to localStorage if Supabase failed
        if (!loadedFromSupabase) {

        // Initialize UI
        initializeRooms();
        updateDashboard();
        updateStudentsTable();
        updateRoomsGrid();
        updateAbsencesTable();
        updateReportsTable();
        populateDropdowns();
        loadHomeworks(); // optional
        renderAgenda();
        checkBirthdays();

        // Setup real-time subscriptions
        setupRealtimeSubscriptions();

        // Save to localStorage as backup
        localStorage.setItem('students', JSON.stringify(students));
        localStorage.setItem('absences', JSON.stringify(absences));
        localStorage.setItem('reports', JSON.stringify(reports));
    } catch (error) {
        console.error('Error loading data:', error);
        // Fallback to localStorage if Supabase fails
        const localStudents = localStorage.getItem('students');
        const localAbsences = localStorage.getItem('absences');
        const localReports = localStorage.getItem('reports');
        
        students = localStudents ? JSON.parse(localStudents) : [];
        absences = localAbsences ? JSON.parse(localAbsences) : [];
        reports = localReports ? JSON.parse(localReports) : [];
        
        initializeRooms();
        updateDashboard();
        updateStudentsTable();
        updateRoomsGrid();
        updateAbsencesTable();
        updateReportsTable();
        populateDropdowns();
        loadHomeworks();
        renderAgenda();
        checkBirthdays();
    }
}

// --- Add new student example ---
async function initApp() {
    await loadData();
}

// Initialize event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', async function() {
    // Initialize Supabase connection first
    console.log('Initializing Supabase connection...');
    await initializeSupabase();
    
    // Login functionality - SETUP FIRST before async operations
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('loginError');
            
            if (users[username] && users[username] === password) {
                currentUser = username;
                const currentUserEl = document.getElementById('currentUser');
                if (currentUserEl) currentUserEl.textContent = `Bienvenido, ${username}`;
                document.getElementById('loginScreen').classList.add('hidden');
                document.getElementById('mainApp').classList.remove('hidden');
                loadData();
                showSection('dashboard');
                errorDiv.classList.add('hidden');
            } else {
                errorDiv.textContent = 'Usuario o contraseña incorrectos';
                errorDiv.classList.remove('hidden');
            }
        });
    }

    // Logout functionality
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            currentUser = '';
            document.getElementById('username').value = '';
            document.getElementById('password').value = '';
            document.getElementById('loginScreen').classList.remove('hidden');
            document.getElementById('mainApp').classList.add('hidden');
            document.getElementById('loginError').classList.add('hidden');
        });
    }

    // Navigation functionality
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.getAttribute('data-section');
            showSection(section);
        });
    });

    const mobileNav = document.getElementById('mobileNav');
    if (mobileNav) {
        mobileNav.addEventListener('change', function() {
            showSection(this.value);
        });
    }

    // When selecting a student in the assign form, refresh available rooms
    const roomStudent = document.getElementById('roomStudent');
    if (roomStudent) {
        roomStudent.addEventListener('change', populateDropdowns);
    }
});

function showSection(sectionName) {
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.add('hidden');
    });
    document.getElementById(sectionName).classList.remove('hidden');
    currentSection = sectionName;
}

// Add student functionality
document.getElementById('addStudentForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();

    const student = {
        id: Date.now(),
        nombre: document.getElementById('studentNombre').value,
        fechaNacimiento: document.getElementById('studentNacimiento').value,
        mayor16: !!document.getElementById('studentMayor16').checked,
        gender: document.getElementById('studentGenero').value,
        curso: document.getElementById('studentCurso').value,
        telefono1: document.getElementById('studentTelefono1').value,
        telefono2: document.getElementById('studentTelefono2').value,
        habitacion: null
    };

    // compute ageGroup: assumption >=18 is 'mayor'
    const age = calculateAge(student.fechaNacimiento);
    student.ageGroup = (age !== null && age >= 18) ? 'mayor' : 'menor';

    students.push(student);
    
    // Save to Supabase
    if (supabaseConnected && supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('students')
                .insert([student]);
            if (error) console.warn('Error adding student:', error.message);
            else console.log('Student saved to Supabase');
        } catch (error) {
            console.error('Error:', error);
        }
    }
    
    saveData();
    updateDashboard();
    updateStudentsTable();
    populateDropdowns();
    
    // Reset form
    this.reset();
    
    // Show success message
    addActivity(`Nuevo alumno añadido: ${student.nombre}`);
});

// Update dashboard
function updateDashboard() {
    document.getElementById('totalAlumnos').textContent = students.length;
    document.getElementById('habitacionesOcupadas').textContent = rooms.filter(room => room.occupied > 0).length;
    document.getElementById('totalFaltas').textContent = absences.length;
}

// Update students table
function updateStudentsTable() {
    const tbody = document.getElementById('studentsTableBody');
    
    if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">No hay alumnos registrados</td></tr>';
        return;
    }
    
    tbody.innerHTML = students.map(student => {
        const age = calculateAge(student.fechaNacimiento);
        const nacimientoDate = new Date(student.fechaNacimiento + 'T00:00:00');
        const nacimientoStr = nacimientoDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        return `
        <tr class="border-b border-gray-100 hover:bg-gray-50">
            <td class="py-3 px-4 font-medium">${student.nombre}</td>
            <td class="py-3 px-4 text-sm">${nacimientoStr}</td>
            <td class="py-3 px-4"><span class="bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full text-sm font-medium">${age} años</span></td>
            <td class="py-3 px-4">${student.gender || '-'}</td>
            <td class="py-3 px-4">${student.curso}</td>
            <td class="py-3 px-4 text-sm text-gray-600">${student.telefono1 || '-'}${student.telefono2 ? '<br/>' + student.telefono2 : ''}</td>
            <td class="py-3 px-4">
                ${student.habitacion ? `<span class="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">${student.habitacion}</span>` : '<span class="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs">Sin asignar</span>'}
            </td>
            <td class="py-3 px-4">
                <button onclick="openStudentSeguimiento(${student.id})" title="Seguimiento académico" class="text-indigo-600 hover:text-indigo-800 mr-2">
                    <i class="fas fa-book"></i>
                </button>
                <button onclick="editStudent(${student.id})" class="text-blue-600 hover:text-blue-800 mr-2">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteStudent(${student.id})" class="text-red-600 hover:text-red-800">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

// Update rooms grid
function updateRoomsGrid() {
    const grid = document.getElementById('roomsGrid');

    // Group rooms by floor
    const floors = {
        1: { izquierda: [], derecha: [] },
        2: { izquierda: [], derecha: [] }
    };

    rooms.forEach(room => {
        const floor = room.floor || 1;
        const side = room.side || 'izquierda';
        if (!floors[floor]) floors[floor] = { izquierda: [], derecha: [] };
        floors[floor][side].push(room);
    });

    const renderRoomCard = (room) => {
        const occupiedCount = Object.values(room.beds).filter(bed => bed !== null).length;
        const bedLetters = Object.keys(room.beds).sort();
        
        return `
        <div class="bg-white p-6 rounded-xl shadow-sm border-2 ${occupiedCount === room.capacity ? 'border-red-300 bg-red-50' : occupiedCount > 0 ? 'border-yellow-300 bg-yellow-50' : 'border-green-300 bg-green-50'}">
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h3 class="text-lg font-semibold text-gray-800">Habitación ${room.number}</h3>
                    <p class="text-sm text-gray-600">
                        <span class="font-medium">${room.gender === 'hombre' ? '👨 Hombres' : '👩 Mujeres'}</span> 
                        · Planta ${room.floor}
                    </p>
                </div>
                <span class="px-3 py-1 rounded-full text-xs font-medium ${occupiedCount === 0 ? 'bg-green-100 text-green-800' : occupiedCount === room.capacity ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}">${occupiedCount}/${room.capacity}</span>
            </div>
            <div class="grid grid-cols-3 gap-2 mb-4">
                ${bedLetters.map(bed => {
                    const studentId = room.beds[bed];
                    const student = studentId ? students.find(s => s.id === studentId) : null;
                    return `
                        <div class="flex flex-col items-center p-3 rounded-lg ${student ? 'bg-indigo-100 border-2 border-indigo-300' : 'bg-gray-100 border-2 border-gray-300'}">
                            <span class="text-xs font-bold text-gray-600 mb-1">Cama ${bed}</span>
                            ${student ? `
                                <span class="text-xs text-center text-gray-700 font-medium">${student.nombre.split(' ')[0]}</span>
                            ` : `
                                <span class="text-xs text-gray-500">Vacante</span>
                            `}
                        </div>
                    `;
                }).join('')}
            </div>
            ${occupiedCount < room.capacity ? `<button onclick="assignRoomToStudent('${room.number}')" class="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">Asignar</button>` : ''}
        </div>
    `;
    };

    // Build HTML by floors
    let html = '';

    [1, 2].forEach(floor => {
        const floorData = floors[floor] || { izquierda: [], derecha: [] };
        const floorLabel = floor === 1 ? 'PLANTA 1' : 'PLANTA 2';
        
        html += `
            <div class="mb-8">
                <h3 class="text-2xl font-bold text-gray-800 mb-6 border-b-2 border-indigo-600 pb-2">${floorLabel}</h3>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <!-- Izquierda (Hombres) -->
                    <div>
                        <h4 class="text-lg font-semibold text-gray-700 mb-4 text-center p-3 bg-blue-100 rounded-lg">👨 HOMBRES (Izquierda)</h4>
                        <div class="space-y-4">
                            ${floorData.izquierda.length > 0 
                                ? floorData.izquierda.map(room => renderRoomCard(room)).join('') 
                                : '<p class="text-gray-500 text-center py-6">No hay habitaciones de hombres</p>'
                            }
                        </div>
                    </div>
                    
                    <!-- Derecha (Mujeres) -->
                    <div>
                        <h4 class="text-lg font-semibold text-gray-700 mb-4 text-center p-3 bg-pink-100 rounded-lg">👩 MUJERES (Derecha)</h4>
                        <div class="space-y-4">
                            ${floorData.derecha.length > 0 
                                ? floorData.derecha.map(room => renderRoomCard(room)).join('') 
                                : '<p class="text-gray-500 text-center py-6">No hay habitaciones de mujeres</p>'
                            }
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    grid.innerHTML = html;
}

// Update absences table
function updateAbsencesTable() {
    const tbody = document.getElementById('absencesTableBody');
    const filterStudent = document.getElementById('filterStudent').value;
    const filterDate = document.getElementById('filterDate').value;
    
    let filteredAbsences = absences;
    
    if (filterStudent) {
        filteredAbsences = filteredAbsences.filter(absence => 
            absence.studentId == filterStudent
        );
    }
    
    if (filterDate) {
        filteredAbsences = filteredAbsences.filter(absence => 
            absence.fecha === filterDate
        );
    }
    
    if (filteredAbsences.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-500">No hay faltas registradas</td></tr>';
        return;
    }
    
    tbody.innerHTML = filteredAbsences.map(absence => {
        const student = students.find(s => s.id === absence.studentId);
        return `
            <tr class="border-b border-gray-100 hover:bg-gray-50">
                <td class="py-3 px-4 font-medium">${student ? `${student.nombre}` : 'Alumno eliminado'}</td>
                <td class="py-3 px-4">${absence.fecha}</td>
                <td class="py-3 px-4">${absence.descripcion}</td>
                <td class="py-3 px-4">
                    <button onclick="deleteAbsence(${absence.id})" class="text-red-600 hover:text-red-800">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Assign room functionality
document.getElementById('assignRoomForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const studentId = parseInt(document.getElementById('roomStudent').value);
    const roomNumber = document.getElementById('roomNumber').value;
    const selectedBed = document.getElementById('roomBed') ? document.getElementById('roomBed').value : '';
    
    const student = students.find(s => s.id === studentId);
    const room = rooms.find(r => r.number === roomNumber);
    
    if (!student || !room) return;
    
    // Compatibility checks: gender
    const studentGender = student.gender;
    if (room.gender && room.gender !== 'mixta' && studentGender !== 'otro' && room.gender !== studentGender) {
        alert('La habitación seleccionada no es compatible con el género del alumno.');
        return;
    }
    
    // Determine bed to assign: chosen bed or first empty
    let emptyBed = null;
    if (selectedBed) {
        if (room.beds[selectedBed] !== null) {
            alert(`La cama ${selectedBed} ya está ocupada en esta habitación.`);
            return;
        }
        emptyBed = selectedBed;
    } else {
        emptyBed = Object.keys(room.beds).find(bed => room.beds[bed] === null);
    }
    if (!emptyBed) {
        alert('La habitación está llena. No hay camas disponibles.');
        return;
    }
    
    // Remove student from previous room
    if (student.habitacion) {
        const previousRoom = rooms.find(r => r.number === student.habitacion);
        if (previousRoom && student.cama) {
            previousRoom.beds[student.cama] = null;
            previousRoom.occupied--;
        }
    }
    
    // Assign to new room and bed
    student.habitacion = roomNumber;
    student.cama = emptyBed;
    room.beds[emptyBed] = studentId;
    room.occupied++;
    
    // Save to Supabase
    if (supabaseConnected && supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('students')
                .update({ habitacion: roomNumber, cama: emptyBed })
                .eq('id', studentId);
            if (error) console.warn('Error updating student room:', error.message);
            else console.log('Student room assignment saved to Supabase');
        } catch (error) {
            console.error('Error:', error);
        }
    }
    
    saveData();
    updateDashboard();
    updateStudentsTable();
    updateRoomsGrid();
    populateDropdowns();
    
    // Reset form
    this.reset();
    
    addActivity(`Asignada habitación ${roomNumber} cama ${emptyBed} a ${student.nombre}`);
});

// Add absence functionality
document.getElementById('addAbsenceForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const absence = {
        id: Date.now(),
        studentId: parseInt(document.getElementById('absenceStudent').value),
        fecha: document.getElementById('absenceDate').value,
        descripcion: document.getElementById('absenceDescription').value
    };
    
    absences.push(absence);
    
    // Save to Supabase
    if (supabaseConnected && supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('absences')
                .insert([absence]);
            if (error) console.warn('Error adding absence:', error.message);
            else console.log('Absence saved to Supabase');
        } catch (error) {
            console.error('Error:', error);
        }
    }
    saveData();
    updateDashboard();
    updateAbsencesTable();
    
    // Update resumen if the student is selected
    const alumnoSelect = document.getElementById('alumnoResumenSelect');
    if (alumnoSelect && alumnoSelect.value === absence.studentId.toString()) {
        updateAlumnoResumen(absence.studentId);
    }
    
    // Reset form
    this.reset();
    
    addActivity(`Falta registrada para ${students.find(s => s.id === absence.studentId)?.nombre}`);
});

// Add report ('parte') functionality
document.getElementById('addReportForm')?.addEventListener('submit', async function(e) {
    if (!e) return; // guard
    e.preventDefault();

    const report = {
        id: Date.now(),
        studentId: parseInt(document.getElementById('reportStudent').value),
        fecha: document.getElementById('reportDate').value,
        tipo: document.getElementById('reportType').value,
        descripcion: document.getElementById('reportDescription').value
    };

    reports.push(report);
    
    // Save to Supabase
    if (supabaseConnected && supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('reports')
                .insert([report]);
            if (error) console.warn('Error adding report:', error.message);
            else console.log('Report saved to Supabase');
        } catch (error) {
            console.error('Error:', error);
        }
    }
    
    saveData();
    updateReportsTable();
    
    // Update resumen if the student is selected
    const alumnoSelect = document.getElementById('alumnoResumenSelect');
    if (alumnoSelect && alumnoSelect.value === report.studentId.toString()) {
        updateAlumnoResumen(report.studentId);
    }

    // Reset form
    this.reset();

    addActivity(`Parte registrado para ${students.find(s => s.id === report.studentId)?.nombre}`);
});

// Populate dropdowns
function populateDropdowns() {
    const studentDropdowns = ['roomStudent', 'absenceStudent', 'filterStudent', 'seguimientoStudent'];
    
    studentDropdowns.forEach(id => {
        const select = document.getElementById(id);
        const currentValue = select.value;
        
        select.innerHTML = '<option value="">Seleccionar alumno</option>' + 
            students.map(student => `
                <option value="${student.id}">${student.nombre}</option>
            `).join('');
        
        select.value = currentValue;
    });

    // Report student select
    const reportSelect = document.getElementById('reportStudent');
    if (reportSelect) {
        const currentValue = reportSelect.value;
        reportSelect.innerHTML = '<option value="">Seleccionar alumno</option>' + 
            students.map(student => `
                <option value="${student.id}">${student.nombre}</option>
            `).join('');
        reportSelect.value = currentValue;
    }

    // Seguimiento student select
    const seguimientoSelect = document.getElementById('seguimientoStudent');
    if (seguimientoSelect) {
        const currentValue2 = seguimientoSelect.value;
        seguimientoSelect.innerHTML = '<option value="">Seleccionar alumno</option>' + 
            students.map(student => `
                <option value="${student.id}">${student.nombre}</option>
            `).join('');
        seguimientoSelect.value = currentValue2;
        // attach change handler
        seguimientoSelect.removeEventListener('change', updateSeguimientoTable);
        seguimientoSelect.addEventListener('change', function() { updateSeguimientoTable(this.value); });
    }

    // Resumen alumno select
    const alumnoResumenSelect = document.getElementById('alumnoResumenSelect');
    if (alumnoResumenSelect) {
        const currentValue3 = alumnoResumenSelect.value;
        alumnoResumenSelect.innerHTML = '<option value="">-- Seleccionar alumno --</option>' + 
            students.map(student => `
                <option value="${student.id}">${student.nombre}</option>
            `).join('');
        alumnoResumenSelect.value = currentValue3;
        // attach change handler
        alumnoResumenSelect.removeEventListener('change', updateAlumnoResumen);
        alumnoResumenSelect.addEventListener('change', function() { updateAlumnoResumen(this.value); });
    }
    
    const roomSelect = document.getElementById('roomNumber');
    roomSelect.innerHTML = '<option value="">Seleccionar habitación</option>' + 
        rooms.map(room => `
            <option value="${room.number}">${room.number} (${room.type}, ${room.occupied}/${room.capacity})</option>
        `).join('');

    // Update room options based on selected student gender when roomStudent changes
    const roomStudentSelect = document.getElementById('roomStudent');
    if (roomStudentSelect) {
        roomStudentSelect.removeEventListener('change', updateRoomOptionsForSelectedStudent);
        roomStudentSelect.addEventListener('change', updateRoomOptionsForSelectedStudent);
        // Run once to reflect current selection
        updateRoomOptionsForSelectedStudent();
    }

    // Attach listener to room select to update available bed options
    const roomBedSelect = document.getElementById('roomBed');
    if (roomSelect) {
        roomSelect.removeEventListener('change', updateBedOptionsForSelectedRoom);
        roomSelect.addEventListener('change', updateBedOptionsForSelectedRoom);
        // initialize bed options based on current selection
        updateBedOptionsForSelectedRoom();
    }
}

// Populate bed options for the selected room
function updateBedOptionsForSelectedRoom() {
    const roomSelect = document.getElementById('roomNumber');
    const bedSelect = document.getElementById('roomBed');
    if (!roomSelect || !bedSelect) return;

    const roomNumber = roomSelect.value;
    bedSelect.innerHTML = '<option value="">Seleccionar cama</option>';
    if (!roomNumber) {
        bedSelect.disabled = true;
        return;
    }

    const room = rooms.find(r => r.number === roomNumber);
    if (!room) {
        bedSelect.disabled = true;
        return;
    }

    const bedLetters = Object.keys(room.beds).sort();
    let hasEmpty = false;
    bedLetters.forEach(bed => {
        const occupantId = room.beds[bed];
        if (occupantId === null) {
            hasEmpty = true;
            bedSelect.innerHTML += `<option value="${bed}">Cama ${bed} - Vacante</option>`;
        } else {
            const student = students.find(s => s.id === occupantId);
            const name = student ? student.nombre.split(' ')[0] : 'Ocupada';
            bedSelect.innerHTML += `<option value="${bed}" disabled>Cama ${bed} - Ocupada (${name})</option>`;
        }
    });

    bedSelect.disabled = !hasEmpty;
}

// Filter roomNumber options according to selected student's gender
function updateRoomOptionsForSelectedStudent() {
    const roomSelect = document.getElementById('roomNumber');
    const roomStudentSelect = document.getElementById('roomStudent');
    if (!roomSelect || !roomStudentSelect) return;

    const studentId = parseInt(roomStudentSelect.value);
    let allowedRooms = rooms;

    if (studentId) {
        const student = students.find(s => s.id === studentId);
        if (student) {
            const g = student.gender;
            // Filter rooms by gender only
            allowedRooms = rooms.filter(r => r.gender === g);
        }
    }

    const currentValue = roomSelect.value;
    roomSelect.innerHTML = '<option value="">Seleccionar habitación</option>' + 
        allowedRooms.map(room => {
            const floorLabel = room.floor === 1 ? 'Planta 1' : 'Planta 2';
            const sideLabel = room.side === 'izquierda' ? 'Izquierda' : 'Derecha';
            const genderLabel = room.gender === 'hombre' ? 'Hombres' : 'Mujeres';
            return `
                <option value="${room.number}">${room.number} - ${floorLabel} (${genderLabel}, ${sideLabel}) - ${room.occupied}/${room.capacity}</option>
            `;
        }).join('');
    roomSelect.value = currentValue;
}

// Update reports table
function updateReportsTable() {
    const tbody = document.getElementById('reportsTableBody');
    if (!tbody) return;

    if (reports.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">No hay partes registrados</td></tr>';
        return;
    }

    tbody.innerHTML = reports.map(report => {
        const student = students.find(s => s.id === report.studentId);
        return `
            <tr class="border-b border-gray-100 hover:bg-gray-50">
                <td class="py-3 px-4 font-medium">${student ? `${student.nombre}` : 'Alumno eliminado'}</td>
                <td class="py-3 px-4">${report.fecha}</td>
                <td class="py-3 px-4">${report.tipo}</td>
                <td class="py-3 px-4">${report.descripcion}</td>
                <td class="py-3 px-4">
                    <button onclick="deleteReport(${report.id})" class="text-red-600 hover:text-red-800">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Seguimiento académico
document.getElementById('addSeguimientoForm')?.addEventListener('submit', async function(e) {
    if (!e) return;
    e.preventDefault();

    const studentId = parseInt(document.getElementById('seguimientoStudent').value);
    if (!studentId) {
        alert('Seleccione un alumno para registrar el seguimiento');
        return;
    }

    const asignatura = document.getElementById('seguimientoAsignatura').value;
    const fecha = document.getElementById('seguimientoFecha').value;
    const tipo = document.getElementById('seguimientoTipo').value;
    const nota = document.getElementById('seguimientoNota').value;
    const comentarios = document.getElementById('seguimientoComentarios').value;

    const student = students.find(s => s.id === studentId);
    if (!student) return;

    if (!student.academic) student.academic = { records: [] };
    const record = {
        id: Date.now(),
        fecha,
        asignatura,
        tipo,
        nota,
        comentarios
    };

    student.academic.records.push(record);
    
    // Save to Supabase
    if (supabaseConnected && supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('students')
                .update({ academic: student.academic })
                .eq('id', studentId);
            if (error) console.warn('Error adding academic record:', error.message);
            else console.log('Academic record saved to Supabase');
        } catch (error) {
            console.error('Error:', error);
        }
    }
    
    saveData();
    updateSeguimientoTable(studentId);
    
    // Update resumen if same student is selected
    const alumnoSelect = document.getElementById('alumnoResumenSelect');
    if (alumnoSelect && alumnoSelect.value === studentId.toString()) {
        updateAlumnoResumen(studentId);
    }

    this.reset();
    addActivity(`Registro académico añadido para ${student.nombre}: ${asignatura}`);
});

// Update resumen del alumno
function updateAlumnoResumen(studentId) {
    const alumnoResumenCard = document.getElementById('alumnoResumenCard');
    const alumnoResumenNombre = document.getElementById('alumnoResumenNombre');
    const alumnoResumenFaltas = document.getElementById('alumnoResumenFaltas');
    const alumnoResumenPartes = document.getElementById('alumnoResumenPartes');
    const alumnoResumenSuspensas = document.getElementById('alumnoResumenSuspensas');
    
    if (!studentId) {
        alumnoResumenCard.classList.add('hidden');
        return;
    }

    const student = students.find(s => s.id === parseInt(studentId));
    if (!student) {
        alumnoResumenCard.classList.add('hidden');
        return;
    }

    // Count faltas
    const faltas = absences.filter(a => a.studentId === parseInt(studentId)).length;
    
    // Count partes
    const partes = reports.filter(r => r.studentId === parseInt(studentId)).length;
    
    // Count suspensas
    let suspensas = 0;
    if (student.academic && student.academic.records) {
        const isFail = (rec) => {
            if (!rec) return false;
            const notaRaw = (rec.nota || '').toString().trim().replace(',', '.');
            const parsed = parseFloat(notaRaw);
            if (!isNaN(parsed)) {
                return parsed < 5;
            }
            const hay = (rec.tipo || '') + ' ' + (rec.comentarios || '') + ' ' + (rec.asignatura || '') + ' ' + (rec.nota || '');
            const hayLc = hay.toLowerCase();
            if (hayLc.includes('susp') || hayLc.includes('suspenso') || hayLc.includes('np') || hayLc.includes('no presentado')) return true;
            return false;
        };
        suspensas = student.academic.records.filter(isFail).length;
    }

    // Update display
    alumnoResumenNombre.textContent = student.nombre;
    alumnoResumenFaltas.textContent = faltas;
    alumnoResumenPartes.textContent = partes;
    alumnoResumenSuspensas.textContent = suspensas;
    
    alumnoResumenCard.classList.remove('hidden');
}

function updateSeguimientoTable(studentId) {
    const summaryDiv = document.getElementById('seguimientoSummary');
    if (!summaryDiv) return;

    if (!studentId) {
        summaryDiv.innerHTML = '<div class="text-center col-span-3 py-8"><p class="text-gray-500">Seleccione un alumno para ver sus suspensas por trimestre</p></div>';
        return;
    }

    const student = students.find(s => s.id === parseInt(studentId));
    if (!student || !student.academic || student.academic.records.length === 0) {
        summaryDiv.innerHTML = '<div class="text-center col-span-3 py-8"><p class="text-gray-500">No hay registros para este alumno</p></div>';
        return;
    }

    // filter to only failing records (suspensas)
    const isFail = (rec) => {
        if (!rec) return false;
        const notaRaw = (rec.nota || '').toString().trim().replace(',', '.');
        const parsed = parseFloat(notaRaw);
        if (!isNaN(parsed)) {
            return parsed < 5; // numeric threshold: <5 is suspenso
        }
        // if nota not numeric, try keywords in tipo or comentarios or asignatura
        const hay = (rec.tipo || '') + ' ' + (rec.comentarios || '') + ' ' + (rec.asignatura || '') + ' ' + (rec.nota || '');
        const hayLc = hay.toLowerCase();
        if (hayLc.includes('susp') || hayLc.includes('suspenso') || hayLc.includes('np') || hayLc.includes('no presentado')) return true;
        return false;
    };

    const failing = student.academic.records.filter(isFail);
    
    if (failing.length === 0) {
        summaryDiv.innerHTML = '<div class="text-center col-span-3 py-8"><p class="text-green-600 text-lg font-semibold"><i class="fas fa-check-circle mr-2"></i>Ninguna asignatura suspensa</p></div>';
        return;
    }

    // Group by trimester
    const trimestres = {
        'Trimestre 1': { count: 0, color: 'red' },
        'Trimestre 2': { count: 0, color: 'orange' },
        'Trimestre 3': { count: 0, color: 'red' }
    };

    failing.forEach(rec => {
        const fecha = new Date(rec.fecha + 'T00:00:00');
        const mes = fecha.getMonth() + 1;
        
        if (mes >= 9 && mes <= 11) {
            trimestres['Trimestre 1'].count += 1;
        } else if (mes >= 12 || mes <= 3) {
            trimestres['Trimestre 2'].count += 1;
        } else if (mes >= 4 && mes <= 8) {
            trimestres['Trimestre 3'].count += 1;
        }
    });

    let html = '';
    Object.entries(trimestres).forEach(([trimestre, data]) => {
        const bgColor = data.count === 0 ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300';
        const textColor = data.count === 0 ? 'text-green-800' : 'text-red-800';
        const iconColor = data.count === 0 ? 'text-green-600' : 'text-red-600';
        
        html += `
            <div class="border-2 ${bgColor} rounded-lg p-6 text-center">
                <p class="text-sm font-medium text-gray-600 mb-2">${trimestre}</p>
                <div class="text-4xl font-bold ${textColor} mb-2">
                    <i class="fas ${data.count === 0 ? 'fa-check-circle' : 'fa-times-circle'} ${iconColor} mr-2"></i>${data.count}
                </div>
                <p class="text-sm ${textColor} font-semibold">${data.count === 1 ? 'asignatura suspensa' : 'asignaturas suspensas'}</p>
            </div>
        `;
    });

    summaryDiv.innerHTML = html;
}

function deleteAcademicRecord(studentId, recordId) {
    if (!confirm('¿Eliminar este registro académico?')) return;
    const student = students.find(s => s.id === studentId);
    if (!student || !student.academic) return;
    student.academic.records = student.academic.records.filter(r => r.id !== recordId);
    saveData();
    updateSeguimientoTable(studentId);
    addActivity('Registro académico eliminado');
}

// helper to open seguimiento section and select a student
function openStudentSeguimiento(studentId) {
    showSection('seguimiento');
    const sel = document.getElementById('seguimientoStudent');
    if (sel) {
        sel.value = studentId;
        updateSeguimientoTable(studentId);
    }
}

// Delete report
async function deleteReport(reportId) {
    if (confirm('¿Está seguro de eliminar este parte?')) {
        reports = reports.filter(r => r.id !== reportId);
        
        // Delete from Supabase
        if (supabaseConnected && supabaseClient) {
            try {
                await supabaseClient
                    .from('reports')
                    .delete()
                    .eq('id', reportId);
            } catch (error) {
                console.error('Error deleting report:', error);
            }
        }
        
        saveData();
        updateReportsTable();
        addActivity('Parte eliminado');
    }
}

// Filter functionality
const filterStudentEl = document.getElementById('filterStudent');
if (filterStudentEl) filterStudentEl.addEventListener('change', updateAbsencesTable);
const filterDateEl = document.getElementById('filterDate');
if (filterDateEl) filterDateEl.addEventListener('change', updateAbsencesTable);
const clearFiltersEl = document.getElementById('clearFilters');
if (clearFiltersEl) clearFiltersEl.addEventListener('click', function() {
    document.getElementById('filterStudent').value = '';
    document.getElementById('filterDate').value = '';
    updateAbsencesTable();
});

// Delete student
async function deleteStudent(studentId) {
    if (confirm('¿Está seguro de eliminar este alumno?')) {
        const student = students.find(s => s.id === studentId);

        // Remove from room
        if (student && student.habitacion) {
            const room = rooms.find(r => r.number === student.habitacion);
            if (room && student.cama) {
                room.beds[student.cama] = null;
                room.occupied--;
            }
        }

        // Remove student
        students = students.filter(s => s.id !== studentId);

        // Remove related absences
        absences = absences.filter(a => a.studentId !== studentId);

        // Delete from Supabase
        if (supabaseConnected && supabaseClient) {
            try {
                await supabaseClient
                    .from('students')
                    .delete()
                    .eq('id', studentId);
                
                // Delete related absences from Supabase
                await supabaseClient
                    .from('absences')
                    .delete()
                    .eq('studentId', studentId);
            } catch (error) {
                console.error('Error deleting student:', error);
            }
        }
                .eq('studentId', studentId);
        } catch (error) {
            console.error('Error deleting student:', error);
        }

        saveData();
        updateDashboard();
        updateStudentsTable();
        updateRoomsGrid();
        updateAbsencesTable();
        populateDropdowns();

        addActivity(`Alumno eliminado: ${student ? student.nombre : 'ID: ' + studentId}`);
    }
}

// Delete absence
async function deleteAbsence(absenceId) {
    if (confirm('¿Está seguro de eliminar esta falta?')) {
        absences = absences.filter(a => a.id !== absenceId);
        
        // Delete from Supabase
        if (supabaseConnected && supabaseClient) {
            try {
                await supabaseClient
                    .from('absences')
                    .delete()
                    .eq('id', absenceId);
            } catch (error) {
                console.error('Error deleting absence:', error);
            }
        }
        
        saveData();
        updateDashboard();
        updateAbsencesTable();
        
        addActivity(`Falta eliminada`);
    }
}

// Edit student (simplified version)
function editStudent(studentId) {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    
    // In a real application, this would open a modal or navigate to an edit page
    const newNombre = prompt('Nuevo nombre:', student.nombre);

    if (newNombre) {
        student.nombre = newNombre;
        saveData();
        updateStudentsTable();
        populateDropdowns();

        addActivity(`Alumno actualizado: ${newNombre}`);
    }
}

// Assign room to student (alternative method)
function assignRoomToStudent(roomNumber) {
    const room = rooms.find(r => r.number === roomNumber);
    const occupiedCount = Object.values(room.beds).filter(bed => bed !== null).length;
    if (!room || occupiedCount >= room.capacity) return;
    
    const unassignedStudents = students.filter(s => !s.habitacion);
    
    if (unassignedStudents.length === 0) {
        alert('No hay alumnos sin habitación asignada');
        return;
    }
    
    // Find first empty bed
    const emptyBed = Object.keys(room.beds).find(bed => room.beds[bed] === null);
    if (!emptyBed) {
        alert('La habitación está llena');
        return;
    }
    
    const student = unassignedStudents[0];
    student.habitacion = roomNumber;
    student.cama = emptyBed;
    room.beds[emptyBed] = student.id;
    
    saveData();
    updateDashboard();
    updateStudentsTable();
    updateRoomsGrid();
    populateDropdowns();
    
    addActivity(`Asignada habitación ${roomNumber} cama ${emptyBed} a ${student.nombre}`);
}

// Add activity log
function addActivity(activity) {
    const actividadDiv = document.getElementById('actividadReciente');
    const now = new Date();
    const timeString = now.toLocaleString('es-ES');
    
    const activityElement = document.createElement('div');
    activityElement.className = 'flex items-center justify-between p-3 bg-gray-50 rounded-lg';
    activityElement.innerHTML = `
        <div class="flex items-center space-x-3">
            <i class="fas fa-clock text-gray-400"></i>
            <span class="text-sm text-gray-700">${activity}</span>
        </div>
        <span class="text-xs text-gray-500">${timeString}</span>
    `;
    
    if (actividadDiv.children.length > 0 && actividadDiv.children[0].textContent.includes('No hay actividad reciente')) {
        actividadDiv.innerHTML = '';
    }
    
    actividadDiv.insertBefore(activityElement, actividadDiv.firstChild);
    
    // Keep only last 10 activities
    while (actividadDiv.children.length > 10) {
        actividadDiv.removeChild(actividadDiv.lastChild);
    }
}

// --- Agenda de deberes (homeworks) ---
function getWeekStartISO(date) {
    const d = new Date(date);
    // normalize to Monday as start of the week
    const day = (d.getDay() + 6) % 7; // Monday=0..Sunday=6
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() - day);
    return d.toISOString().slice(0,10); // YYYY-MM-DD
}

function getWeekEndISOFromStart(weekStartISO) {
    const d = new Date(weekStartISO + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0,10);
}

function loadHomeworks() {
    const saved = localStorage.getItem('homeworks');
    if (saved) {
        try { homeworks = JSON.parse(saved); } catch (e) { homeworks = {}; }
    } else {
        homeworks = {};
    }
}

function saveHomeworks() {
    localStorage.setItem('homeworks', JSON.stringify(homeworks));
}

let currentAgendaWeekKey = null;

// Navigation between weeks for homework agenda
function previousWeek() {
    if (!currentAgendaWeekKey) {
        currentAgendaWeekKey = getWeekStartISO(new Date());
    }
    const d = new Date(currentAgendaWeekKey + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    currentAgendaWeekKey = d.toISOString().slice(0, 10);
    renderAgenda();
}

function nextWeek() {
    if (!currentAgendaWeekKey) {
        currentAgendaWeekKey = getWeekStartISO(new Date());
    }
    const d = new Date(currentAgendaWeekKey + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    currentAgendaWeekKey = d.toISOString().slice(0, 10);
    renderAgenda();
}

function goToCurrentWeek() {
    currentAgendaWeekKey = getWeekStartISO(new Date());
    renderAgenda();
}

// Review panel functions
function openReviewPanel() {
    const reviewPanel = document.getElementById('reviewPanel');
    const reviewContent = document.getElementById('reviewContent');
    
    if (!reviewPanel) return;
    
    // Get all weeks with homeworks
    const weeks = Object.keys(homeworks).sort().reverse(); // Most recent first
    
    if (weeks.length === 0) {
        reviewContent.innerHTML = `
            <div class="text-center py-8">
                <p class="text-gray-500 text-lg">No hay deberes registrados aún.</p>
            </div>
        `;
        reviewPanel.classList.remove('hidden');
        return;
    }
    
    let html = `
        <div class="space-y-4">
            <p class="text-sm text-gray-600 mb-4">Se encontraron <strong>${weeks.length}</strong> semana(s) con deberes registrados.</p>
    `;
    
    weeks.forEach(weekStart => {
        const weekEnd = getWeekEndISOFromStart(weekStart);
        const startDate = new Date(weekStart + 'T00:00:00');
        const endDate = new Date(weekEnd + 'T00:00:00');
        
        const startStr = startDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const endStr = endDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        const weekData = homeworks[weekStart] || {};
        const hasContent = Object.values(weekData).some(v => v && v.trim().length > 0);
        
        // Count how many estudios have content
        const filledStudios = Object.entries(weekData)
            .filter(([, v]) => v && v.trim().length > 0)
            .length;
        
        html += `
            <div class="border border-gray-300 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer" onclick="showWeekReview('${weekStart}')">
                <div class="flex items-center justify-between">
                    <div>
                        <h4 class="font-semibold text-gray-800">Semana: ${startStr} → ${endStr}</h4>
                        <p class="text-sm text-gray-600 mt-1">
                            <i class="fas fa-book mr-1"></i>
                            ${filledStudios > 0 ? `${filledStudios} estudio(s) con deberes` : 'Sin deberes registrados'}
                        </p>
                    </div>
                    <div class="text-right">
                        <button onclick="loadWeekFromReview('${weekStart}', event)" class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors">
                            <i class="fas fa-pencil-alt mr-1"></i>Editar
                        </button>
                    </div>
                </div>
                <div id="weekPreview_${weekStart}" class="mt-3 text-sm text-gray-700 hidden">
                    <!-- Preview will be generated on click -->
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    
    reviewContent.innerHTML = html;
    reviewPanel.classList.remove('hidden');
}

function closeReviewPanel() {
    const reviewPanel = document.getElementById('reviewPanel');
    if (reviewPanel) {
        reviewPanel.classList.add('hidden');
    }
}

function showWeekReview(weekStart) {
    const previewDiv = document.getElementById(`weekPreview_${weekStart}`);
    if (!previewDiv) return;
    
    if (previewDiv.classList.contains('hidden')) {
        // Show preview
        const weekData = homeworks[weekStart] || {};
        let html = '<div class="space-y-2 mt-2 pt-3 border-t border-gray-200">';
        
        for (let i = 1; i <= 4; i++) {
            const estudioId = `estudio${i}`;
            const value = weekData[estudioId] || '';
            if (value.trim().length > 0) {
                html += `
                    <div class="pl-3 border-l-2 border-indigo-400">
                        <p class="font-medium text-gray-700">Estudio ${i}:</p>
                        <p class="text-gray-600 whitespace-pre-wrap text-sm">${value.substring(0, 150)}${value.length > 150 ? '...' : ''}</p>
                    </div>
                `;
            }
        }
        
        html += '</div>';
        previewDiv.innerHTML = html;
        previewDiv.classList.remove('hidden');
    } else {
        previewDiv.classList.add('hidden');
    }
}

function loadWeekFromReview(weekStart, event) {
    event.stopPropagation();
    currentAgendaWeekKey = weekStart;
    closeReviewPanel();
    renderAgenda();
    // Scroll to top to see the agenda
    document.getElementById('agenda').scrollIntoView({ behavior: 'smooth' });
}

function renderAgenda() {
    const grid = document.getElementById('agendaGrid');
    const weekSelector = document.getElementById('weekSelector');
    if (!grid) return;

    // If no week selected, show current week
    if (!currentAgendaWeekKey) {
        currentAgendaWeekKey = getWeekStartISO(new Date());
    }

    const weekStart = currentAgendaWeekKey;
    const weekEnd = getWeekEndISOFromStart(weekStart);

    const weekData = homeworks[weekStart] || {};

    // Format dates for display
    const startDate = new Date(weekStart + 'T00:00:00');
    const endDate = new Date(weekEnd + 'T00:00:00');
    
    const startStr = startDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const endStr = endDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    
    // Update week selector display
    weekSelector.textContent = `${startStr} → ${endStr}`;

    // Check if this is the current week
    const today = new Date();
    const currentWeekStart = getWeekStartISO(today);
    const isCurrentWeek = weekStart === currentWeekStart;

    // show week range
    let html = `<div class="mb-4">
        <h3 class="text-lg font-medium">Semana: ${weekStart} → ${weekEnd}</h3>
        ${isCurrentWeek ? '<p class="text-sm text-green-600 font-medium"><i class="fas fa-check-circle mr-1"></i>Esta es la semana actual</p>' : '<p class="text-sm text-gray-500">Semana anterior/futura</p>'}
    </div>`;
    
    html += `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">`;
    html += '<!-- Estudios -->';
    
    for (let i = 1; i <= 4; i++) {
        const estudioId = `estudio${i}`;
        const value = (weekData && weekData[estudioId]) ? weekData[estudioId] : '';
        const hasContent = value.trim().length > 0;
        
        html += `
            <div class="bg-white p-4 rounded-lg border ${hasContent ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200'}">
                <h4 class="text-md font-semibold mb-2 text-gray-800">Estudio ${i}</h4>
                <textarea id="homework_${estudioId}" rows="6" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Escribe los deberes para esta semana">${value}</textarea>
                <div class="mt-3 flex items-center justify-between gap-2">
                    <button onclick="saveHomework('${estudioId}')" class="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition-colors">
                        <i class="fas fa-save mr-1"></i>Guardar
                    </button>
                    <button onclick="clearHomework('${estudioId}')" class="text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 px-2 py-1 rounded transition-colors">
                        <i class="fas fa-trash-alt mr-1"></i>Limpiar
                    </button>
                </div>
            </div>
        `;
    }
    html += '</div>';

    grid.innerHTML = html;
}

function saveHomework(estudioId) {
    if (!currentAgendaWeekKey) currentAgendaWeekKey = getWeekStartISO(new Date());
    if (!homeworks[currentAgendaWeekKey]) homeworks[currentAgendaWeekKey] = {};
    const ta = document.getElementById(`homework_${estudioId}`);
    if (!ta) return;
    homeworks[currentAgendaWeekKey][estudioId] = ta.value;
    saveHomeworks();
    addActivity(`Deberes guardados para ${estudioId} (${currentAgendaWeekKey})`);
    // small feedback
    ta.classList.add('ring-2','ring-green-300');
    setTimeout(() => ta.classList.remove('ring-2','ring-green-300'), 900);
}

function clearHomework(estudioId) {
    const ta = document.getElementById(`homework_${estudioId}`);
    if (!ta) return;
    if (!confirm('¿Limpiar los deberes de esta semana para este estudio?')) return;
    ta.value = '';
    if (homeworks[currentAgendaWeekKey]) delete homeworks[currentAgendaWeekKey][estudioId];
    saveHomeworks();
    addActivity(`Deberes limpiados para ${estudioId} (${currentAgendaWeekKey})`);
}


// Set today's date as default
onDOMReady(() => {
    const absenceDate = document.getElementById('absenceDate');
    if (absenceDate) absenceDate.valueAsDate = new Date();
    const reportDate = document.getElementById('reportDate');
    if (reportDate) reportDate.valueAsDate = new Date();
});
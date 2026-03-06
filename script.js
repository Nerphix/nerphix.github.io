// ==================== LOAD DATA FROM JSON ====================
let scheduleData = null;
let movements = [];
let overnightParking = [];
let specialInstructions = [];
let scheduleInfo = {};

// Load the JSON file
fetch('data.json')
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to load data.json');
        }
        return response.json();
    })
    .then(data => {
        scheduleData = data;
        movements = scheduleData.movements;
        overnightParking = scheduleData.overnightParking;
        specialInstructions = scheduleData.specialInstructions;
        scheduleInfo = scheduleData.schedule;
        
        // Update header with schedule info
        updateHeader();
        
        // Initialize the app
        initializeApp();
    })
    .catch(error => {
        console.error('Error loading data:', error);
        document.getElementById('currentTimeDisplay').innerHTML = 
            '❌ Error loading schedule data. Please check console.';
    });

function updateHeader() {
    document.getElementById('headerBadges').innerHTML = `
        <span class="badge">${scheduleInfo.date}</span>
        <span class="badge orange">${scheduleInfo.day}</span>
        <span class="live-indicator">
            <span class="live-dot"></span> LIVE
        </span>
    `;
    
    document.getElementById('footer').innerHTML = 
        `Maafaru International Airport (VRDA) · ${scheduleInfo.footerDate} · Auto-refreshes every 30 seconds`;
}

// ==================== TIME UTILITIES ====================
function getCurrentMaldivesTime() {
    const now = new Date();
    
    // Get current UTC time
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    
    // Convert to Maldives time (UTC+5)
    let mldHours = utcHours + 5;
    let mldMinutes = utcMinutes;
    
    // Handle day rollover
    if (mldHours >= 24) {
        mldHours -= 24;
    }
    
    const totalMinutes = mldHours * 60 + mldMinutes;
    const formatted = `${mldHours.toString().padStart(2, '0')}:${mldMinutes.toString().padStart(2, '0')}`;
    
    return {
        hours: mldHours,
        minutes: mldMinutes,
        totalMinutes: totalMinutes,
        formatted: formatted
    };
}

function timeToMinutes(timeStr) {
    if (!timeStr) return null;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

// ==================== CORRECT SORTING FUNCTION ====================
function getEarliestTime(movement) {
    const times = [];
    
    // Extract CRT time if it exists (handle "08:30 LT" format)
    if (movement.crt && movement.crt !== "") {
        const crtMatch = movement.crt.match(/(\d{2}:\d{2})/);
        if (crtMatch) {
            times.push(timeToMinutes(crtMatch[1]));
        }
    }
    
    // Add arrival time if exists
    if (movement.arr && movement.arr !== "") {
        times.push(timeToMinutes(movement.arr));
    }
    
    // Add departure time if exists
    if (movement.dep && movement.dep !== "") {
        times.push(timeToMinutes(movement.dep));
    }
    
    // Return the earliest time, or a very large number if no times
    return times.length > 0 ? Math.min(...times) : 9999;
}

// ==================== STATUS FUNCTION ====================
function getStatus(arr, dep, crt) {
    // For demo purposes, show appropriate statuses
    // In production, this would compare with current time
    
    const now = getCurrentMaldivesTime().totalMinutes;
    const arrMin = arr ? timeToMinutes(arr) : null;
    const depMin = dep ? timeToMinutes(dep) : null;
    const crtMin = crt ? timeToMinutes(crt.match(/(\d{2}:\d{2})/)?.[1]) : null;

    // Arrival only
    if (arrMin && !depMin) {
        if (now < arrMin && (arrMin - now) <= 30) 
            return { text: "SOON", class: "status-soon" };
        if (now >= arrMin && now < (arrMin + 180)) 
            return { text: "LANDED", class: "status-landed" };
        if (now >= (arrMin + 180)) 
            return { text: "FINISHED", class: "status-departed" };
    }

    // Departure with CRT
    if (depMin && crtMin) {
        if (now < crtMin && (crtMin - now) <= 30) 
            return { text: "SOON", class: "status-soon" };
        if (now >= crtMin && now < depMin) 
            return { text: "ONGOING", class: "status-ongoing" };
        if (now >= depMin) 
            return { text: "DEPARTED", class: "status-departed" };
    }

    // Departure without CRT
    if (depMin && !crtMin) {
        if (now < depMin && (depMin - now) <= 30) 
            return { text: "SOON", class: "status-soon" };
        if (now >= depMin) 
            return { text: "DEPARTED", class: "status-departed" };
    }

    // CRT only (OK-SIX type events)
    if (!arrMin && !depMin && crtMin) {
        if (now < crtMin && (crtMin - now) <= 30) 
            return { text: "SOON", class: "status-soon" };
        if (now >= crtMin && now < (crtMin + 180)) 
            return { text: "ONGOING", class: "status-ongoing" };
        if (now >= (crtMin + 180)) 
            return { text: "FINISHED", class: "status-departed" };
    }

    // Default for future dates
    return { text: "FUTURE", class: "status-future" };
}

// ==================== RENDER FUNCTION ====================
function render() {
    const currentTime = getCurrentMaldivesTime();
    document.getElementById('currentTimeDisplay').innerHTML = `🕐 Maldives Time: <strong>${currentTime.formatted}</strong>`;

    // Table Body
    const tableBody = document.getElementById('tableBody');
    const movementList = document.getElementById('movementList');
    
    let arrivals = 0, departures = 0;
    
    // ===== CORRECT SORTING BY EARLIEST TIME =====
    // This will sort regardless of the order in JSON
    const sorted = [...movements].sort((a, b) => {
        const timeA = getEarliestTime(a);
        const timeB = getEarliestTime(b);
        return timeA - timeB;
    });

    // Log sorted order for debugging (check browser console)
    console.log('=== SORTED MOVEMENTS (by earliest time) ===');
    sorted.forEach(m => {
        const earliest = getEarliestTime(m);
        const hours = Math.floor(earliest / 60);
        const mins = earliest % 60;
        console.log(`${m.reg}: ${hours.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')} | CRT:${m.crt || '—'} ARR:${m.arr || '—'} DEP:${m.dep || '—'}`);
    });

    let tableRows = '';
    let cardsHtml = '';

    sorted.forEach(m => {
        // Count arrivals and departures
        if (m.arr && m.arr !== "" && (!m.dep || m.dep === "")) arrivals++;
        else if (m.dep && m.dep !== "" && (!m.arr || m.arr === "")) departures++;
        else if (m.arr && m.arr !== "" && m.dep && m.dep !== "") { 
            arrivals++; 
            departures++; 
        }

        const status = getStatus(m.arr, m.dep, m.crt);
        
        // Get display time (priority: arrival > departure > CRT)
        let displayTime = '—';
        if (m.arr && m.arr !== "") displayTime = m.arr;
        else if (m.dep && m.dep !== "") displayTime = m.dep;
        else if (m.crt && m.crt !== "") displayTime = m.crt.replace(' LT', '');
        
        // Get route display
        let routeDisplay = m.route;
        if (m.reg === "OK-SIX") {
            routeDisplay = "Crew Aircraft Visit";
        }

        // Table row
        tableRows += `
            <tr>
                <td class="reg">${m.reg}</td>
                <td>${m.operator}</td>
                <td>${m.arr || '—'}</td>
                <td>${m.dep || '—'}</td>
                <td>${routeDisplay}</td>
                <td>${m.pax}</td>
                <td>${m.crt || '—'}</td>
                <td><span class="status-badge ${status.class}">${status.text}</span></td>
            </tr>
        `;

        // Mobile card
        cardsHtml += `
            <div class="movement-card">
                <div class="card-header">
                    <span class="reg-mobile">${m.reg}</span>
                    <span class="time-mobile">${displayTime}</span>
                </div>
                <div class="details-grid">
                    <div class="detail-item">
                        <span class="detail-label">Operator</span>
                        <span class="detail-value">${m.operator}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">PAX</span>
                        <span class="detail-value pax-chip">${m.pax}</span>
                    </div>
                    ${m.crt && m.crt !== "" ? `
                    <div class="detail-item">
                        <span class="detail-label">CRT</span>
                        <span class="detail-value crt-chip">${m.crt}</span>
                    </div>
                    ` : ''}
                    <div class="detail-item">
                        <span class="detail-label">Status</span>
                        <span class="detail-value status-badge ${status.class}">${status.text}</span>
                    </div>
                </div>
                <div class="route-mobile">${routeDisplay}</div>
            </div>
        `;
    });

    tableBody.innerHTML = tableRows;
    movementList.innerHTML = cardsHtml;
    
    document.getElementById('summaryStats').innerHTML = `
        <div class="stat-bubble"><span class="stat-number">${arrivals}</span> arrivals</div>
        <div class="stat-bubble"><span class="stat-number">${departures}</span> departures</div>
    `;
    
    document.getElementById('parkingTags').innerHTML = overnightParking.map(t => `<span class="parking-tag">${t}</span>`).join('');
    document.getElementById('specialItems').innerHTML = specialInstructions.map(s => `<span class="special-item">${s}</span>`).join('');
}

// ==================== INITIALIZE APP ====================
function initializeApp() {
    // Initial render
    render();
    
    // Auto-refresh every 30 seconds
    setInterval(render, 30000);
}

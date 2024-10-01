// Schedules for different days
const schedules = {
    "Monday": [
        { name: "Seminar Sophomore", startTime: "08:00AM", endTime: "08:32AM" },
        { name: "English 2 Honors", startTime: "08:35AM", endTime: "09:28AM" },
        { name: "AP African American Studies", startTime: "09:31AM", endTime: "10:24AM" },
        { name: "Spanish 2", startTime: "10:27AM", endTime: "11:20AM" },
        { name: "AP Precalculus", startTime: "11:23AM", endTime: "12:16PM" },
        { name: "Lunch", startTime: "12:19PM", endTime: "01:12PM" },
        { name: "Chemistry Honors", startTime: "01:15PM", endTime: "02:08PM" },
        { name: "AP Computer Science Principles", startTime: "02:11PM", endTime: "03:04PM" },
        { name: "Freetime", startTime: "03:04PM", endTime: "05:00PM" },
        { name: "Homework", startTime: "05:00PM", endTime: "10:00PM" },
        { name: "sleep", startTime: "10:00PM", endTime: "5:30AM" },
    ],
    "Tuesday": [
        { name: "Seminar Sophomore", startTime: "08:00AM", endTime: "08:32AM" },
        { name: "English 2 Honors", startTime: "08:35AM", endTime: "09:28AM" },
        { name: "AP African American Studies", startTime: "09:31AM", endTime: "10:24AM" },
        { name: "Spanish 2", startTime: "10:27AM", endTime: "11:20AM" },
        { name: "AP Precalculus", startTime: "11:23AM", endTime: "12:16PM" },
        { name: "Lunch", startTime: "12:19PM", endTime: "01:12PM" },
        { name: "Chemistry Honors", startTime: "01:15PM", endTime: "02:08PM" },
        { name: "AP Computer Science Principles", startTime: "02:11PM", endTime: "03:04PM" },
        { name: "Robotics Club", startTime: "03:04PM", endTime: "04:00PM" },
        { name: "Homework", startTime: "04:00PM", endTime: "10:00PM" },
        { name: "sleep", startTime: "10:00PM", endTime: "5:30AM" },
        
    ],
    "Wednesday": [
        { name: "Seminar Sophomore", startTime: "08:00AM", endTime: "08:32AM" },
        { name: "English 2 Honors", startTime: "08:35AM", endTime: "09:28AM" },
        { name: "AP African American Studies", startTime: "09:31AM", endTime: "10:24AM" },
        { name: "Spanish 2", startTime: "10:27AM", endTime: "11:20AM" },
        { name: "AP Precalculus", startTime: "11:23AM", endTime: "12:16PM" },
        { name: "Lunch", startTime: "12:19PM", endTime: "01:12PM" },
        { name: "Chemistry Honors", startTime: "01:15PM", endTime: "02:08PM" },
        { name: "AP Computer Science Principles", startTime: "02:11PM", endTime: "03:04PM" },
        { name: "Chess Club", startTime: "03:04PM", endTime: "04:00PM" },
        { name: "Homework", startTime: "04:00PM", endTime: "10:00PM" },
        { name: "sleep", startTime: "10:00PM", endTime: "5:30AM" },
       
    ],
    // Add schedules for Thursday and Friday, etc.
    "Thursday": [
        { name: "Seminar Sophomore", startTime: "08:00AM", endTime: "09:00AM" },
        { name: "English 2 Honors", startTime: "09:03AM", endTime: "09:52AM" },
        { name: "AP African American Studies", startTime: "09:55AM", endTime: "10:44AM" },
        { name: "Spanish 2", startTime: "10:47AM", endTime: "11:36AM" },
        { name: "AP Precalculus", startTime: "11:39AM", endTime: "12:28PM" },
        { name: "Lunch", startTime: "12:31PM", endTime: "01:20PM" },
        { name: "Chemistry Honors", startTime: "01:23PM", endTime: "02:12PM" },
        { name: "AP Computer Science Principles", startTime: "02:15PM", endTime: "03:04PM" },
        { name: "Science Olympiad", startTime: "03:04PM", endTime: "05:00PM" },
        { name: "Homework", startTime: "05:00PM", endTime: "10:00PM" },
        { name: "sleep", startTime: "10:00PM", endTime: "5:30AM" },
    ],
    "Friday": [
        { name: "Seminar Sophomore", startTime: "08:00AM", endTime: "09:00AM" },
        { name: "English 2 Honors", startTime: "09:03AM", endTime: "09:52AM" },
        { name: "AP African American Studies", startTime: "09:55AM", endTime: "10:44AM" },
        { name: "Spanish 2", startTime: "10:47AM", endTime: "11:36AM" },
        { name: "AP Precalculus", startTime: "11:39AM", endTime: "12:28PM" },
        { name: "Lunch", startTime: "12:31PM", endTime: "01:20PM" },
        { name: "Chemistry Honors", startTime: "01:23PM", endTime: "02:12PM" },
        { name: "AP Computer Science Principles", startTime: "02:15PM", endTime: "03:04PM" },
        { name: "Rubik's Cube Club", startTime: "03:04PM", endTime: "05:00PM" },
        { name: "Homework", startTime: "05:00PM", endTime: "10:00PM" },
        { name: "sleep", startTime: "10:00PM", endTime: "5:30AM" },

    ],
    "Saturday": [
        { name: "Freetime", startTime: "08:00AM", endTime: "1:00PM" },
        { name: "Work/Study", startTime: "1:00PM", endTime: "3:00PM" },
        { name: "SAT study sessions/Test", startTime: "3:00PM", endTime: "6:00PM" },
        { name: "Dinner", startTime: "6:00PM", endTime: "8:00PM" },
        { name: "Do Anything", startTime: "8:00PM", endTime: "10:00PM" },
        { name: "sleep", startTime: "10:00PM", endTime: "5:30AM" },
    ],
    "Sunday": [
        { name: "Freetime", startTime: "08:00AM", endTime: "1:00PM" },
        { name: "Harvard CS50", startTime: "1:00PM", endTime: "5:00PM" },
        { name: "Discrete Math Course", startTime: "4:00PM", endTime: "8:00PM" },
        { name: "Do Anything", startTime: "8:00PM", endTime: "10:00PM" },
        { name: "sleep", startTime: "10:00PM", endTime: "5:30AM" },
    ]   
};

function timeToMinutes(time) {
    let [hours, minutes] = time.split(':');
    const period = time.slice(-2); // AM or PM
    hours = parseInt(hours, 10);
    minutes = parseInt(minutes.slice(0, 2), 10); // Ensure only the minute part is considered

    if (period === 'PM' && hours !== 12) {
        hours += 12; // Convert PM hours to 24-hour format
    } else if (period === 'AM' && hours === 12) {
        hours = 0; // Convert 12 AM to 0 hours (midnight)
    }

    return hours * 60 + minutes;
}

// Get today's schedule
function getTodaySchedule() {
    const today = new Date();
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayOfWeek = dayNames[today.getDay()];

    document.getElementById("day-name").textContent = `Class Schedule for ${dayOfWeek}`;
    return schedules[dayOfWeek] || [];
}

// Update time remaining for each class and highlight the current class
function updateTimeRemaining() {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const todaySchedule = getTodaySchedule();
    const classList = document.getElementById('class-list');
    classList.innerHTML = ''; // Clear existing rows

    todaySchedule.forEach(c => {
        const startMinutes = timeToMinutes(c.startTime);
        const endMinutes = timeToMinutes(c.endTime);
        let timeRemaining;

        // Determine if the class is the current class
        let isCurrentClass = currentMinutes >= startMinutes && currentMinutes < endMinutes;

        if (currentMinutes < startMinutes) {
            timeRemaining = `${startMinutes - currentMinutes} min until start`;
        } else if (isCurrentClass) {
            timeRemaining = `${endMinutes - currentMinutes} min remaining`;
        } else {
            timeRemaining = 'Not in Session';
        }

        // Add the current-class CSS class if this is the current class
        const rowClass = isCurrentClass ? 'current-class' : '';

        const row = `<tr class="${rowClass}">
            <td>${c.name}</td>
            <td>${c.startTime}</td>
            <td>${c.endTime}</td>
            <td>${timeRemaining}</td>
        </tr>`;
        classList.insertAdjacentHTML('beforeend', row);
    });
}

// Update and display the real-time clock
function updateClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    document.getElementById('clock').textContent = timeString;
}

// Run update every minute for class time and every second for clock
setInterval(updateTimeRemaining, 60000); // Update class times every minute
setInterval(updateClock, 1000); // Update clock every second

updateTimeRemaining();  // Initial call to show the schedule
updateClock();  // Initial call to show the clock
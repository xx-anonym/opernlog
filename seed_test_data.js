// Create test data
const visits = [
    {
        id: "test-visit-1",
        userId: "user-me",
        operaId: "zauberfloete",
        houseId: "bayerische-staatsoper",
        date: new Date().toISOString(),
        rating: 5,
        review: "Incredible test visit",
        timestamp: Date.now()
    },
    {
        id: "test-visit-2",
        userId: "user-me",
        operaId: "don-giovanni",
        houseId: "staatstheater-nuernberg",
        date: new Date(Date.now() - 86400000).toISOString(),
        rating: 4,
        review: "Good test visit",
        timestamp: Date.now() - 86400000
    }
];

const users = [
    {
        id: "user-me",
        email: "test@test.com",
        name: "Test User",
        password: "password123", /* plain-text just for local test */
        avatar: "T"
    }
];

// Read existing or initialize
let storeData = null;
try {
    storeData = JSON.parse(localStorage.getItem('opernlog_store_dev'));
} catch (e) { }

if (!storeData) {
    storeData = { users: [], visits: [], lists: [], relations: [], userProfileCache: {} };
}

// Ensure the test user exists
if (!storeData.users.find(u => u.id === 'user-me')) {
    storeData.users.push(users[0]);
}

// Add the visits
storeData.visits = [...storeData.visits.filter(v => v.id !== 'test-visit-1' && v.id !== 'test-visit-2'), ...visits];

localStorage.setItem('opernlog_store_dev', JSON.stringify(storeData));
localStorage.setItem('opernlog_currentUser_dev', JSON.stringify(users[0]));
console.log("Test data seeded into localStorage");

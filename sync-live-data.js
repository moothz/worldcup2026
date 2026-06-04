require('dotenv').config();
const mongoose = require('./database');
const Game = require('./models/game');
const Group = require('./models/group');
const axios = require('axios');
const fs = require('fs');

const LIVE_API_BASE = 'https://worldcup26.ir';
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

async function syncGames() {
    try {
        console.log('🔄 Fetching live games data...');
        const response = await axios.get(`${LIVE_API_BASE}/get/games`);
        const liveGames = response.data.games;
        
        if (!liveGames || !Array.isArray(liveGames)) {
            throw new Error('Invalid games data received from live API');
        }

        let updatedCount = 0;
        for (const liveGame of liveGames) {
            const result = await Game.updateOne(
                { id: liveGame.id },
                {
                    $set: {
                        home_score: liveGame.home_score,
                        away_score: liveGame.away_score,
                        home_scorers: liveGame.home_scorers,
                        away_scorers: liveGame.away_scorers,
                        finished: liveGame.finished,
                        time_elapsed: liveGame.time_elapsed
                    }
                }
            );
            if (result.modifiedCount > 0) {
                updatedCount++;
                console.log(`✅ Updated match ${liveGame.id}: ${liveGame.home_team_name_en} ${liveGame.home_score} - ${liveGame.away_score} ${liveGame.away_team_name_en}`);
            }
        }
        
        console.log(`📊 Sync Games: ${updatedCount} matches updated.`);
        
        // Update football.matches.json for persistence
        if (updatedCount > 0) {
            fs.writeFileSync('./football.matches.json', JSON.stringify(liveGames, null, 2));
            console.log('💾 football.matches.json updated.');
        }

    } catch (error) {
        console.error('❌ Error syncing games:', error.message);
    }
}

async function syncGroups() {
    try {
        console.log('🔄 Fetching live groups data...');
        const response = await axios.get(`${LIVE_API_BASE}/get/groups`);
        const liveGroups = response.data.groups;
        
        if (!liveGroups || !Array.isArray(liveGroups)) {
            throw new Error('Invalid groups data received from live API');
        }

        let updatedCount = 0;
        for (const liveGroup of liveGroups) {
            const result = await Group.updateOne(
                { name: liveGroup.name },
                {
                    $set: {
                        teams: liveGroup.teams
                    }
                }
            );
            if (result.modifiedCount > 0) {
                updatedCount++;
                console.log(`✅ Updated group ${liveGroup.name} standings.`);
            }
        }
        
        console.log(`📊 Sync Groups: ${updatedCount} groups updated.`);

        // Update football.matchtables.json for persistence
        if (updatedCount > 0) {
            const formattedGroups = liveGroups.map(g => ({
                group: g.name,
                teams: g.teams
            }));
            fs.writeFileSync('./football.matchtables.json', JSON.stringify(formattedGroups, null, 2));
            console.log('💾 football.matchtables.json updated.');
        }

    } catch (error) {
        console.error('❌ Error syncing groups:', error.message);
    }
}

async function runSync() {
    console.log(`\n🕒 Sync started at ${new Date().toLocaleString()}`);
    await syncGames();
    await syncGroups();
    console.log('🏁 Sync cycle completed.');
}

async function start() {
    console.log('🚀 Starting Live Data Sync Service...');
    
    // Initial sync
    await runSync();
    
    // Schedule periodic sync
    setInterval(runSync, SYNC_INTERVAL);
}

// Handle connection events
mongoose.connection.on('connected', () => {
    start();
});

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
});

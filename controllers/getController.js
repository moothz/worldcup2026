const express = require('express');
const router = express.Router();

const Group = require('../models/group');
const Team = require('../models/team');
const Game = require('../models/game');
const Stadium = require('../models/stadium');
const MatchTable = require('../models/matchTable');

// Simple in-memory cache store and helpers for route caching
const routeCacheStore = {};
function getRouteCached(req, ttlMs) {
    const entry = routeCacheStore[req.originalUrl];
    if (entry && (Date.now() - entry.timestamp) < ttlMs) {
        return entry.data;
    }
    return null;
}
function setRouteCached(req, data) {
    routeCacheStore[req.originalUrl] = {
        data,
        timestamp: Date.now()
    };
}

// Cache for teams (static data)
let teamsCache = null;
let teamsCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getTeamsMap() {
    const now = Date.now();
    if (teamsCache && (now - teamsCacheTime) < CACHE_TTL) {
        return teamsCache;
    }
    
    const teams = await Team.find({}, 'id name_en name_fa fifa_code').lean();
    const teamMap = {};
    teams.forEach(team => {
        teamMap[team.id] = {
            name_en: team.name_en,
            name_fa: team.name_fa,
            fifa_code: team.fifa_code
        };
    });
    
    teamsCache = teamMap;
    teamsCacheTime = now;
    return teamMap;
}

// Group Get Routes

/**
 * @swagger
 * /get/groups:
 *   get:
 *     summary: Get all groups
 *     description: Retrieve all World Cup 2026 groups (A-L)
 *     tags: [Groups]
 *     responses:
 *       200:
 *         description: List of all groups
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 groups:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Group'
 *       400:
 *         description: Error getting groups
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/groups', async(req,res) => {
    const ttl = 15 * 60 * 1000; // 15 minutes
    const cached = getRouteCached(req, ttl);
    if (cached) {
        res.setHeader('Cache-Control', 'public, max-age=900');
        return res.send(cached);
    }

    try{
        const groups = await Group.find().lean();
        const response = {groups};
        setRouteCached(req, response);
        res.setHeader('Cache-Control', 'public, max-age=900');
        return res.send(response);
    }catch(err){
        return res.status(400).send({
            error: 'Error getting all groups'
        });
    };
});

/**
 * @swagger
 * /get/group:
 *   get:
 *     summary: Get group by name
 *     description: Retrieve a specific group and its teams by name
 *     tags: [Groups]
 *     parameters:
 *       - in: query
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Group name (A-L)
 *         example: A
 *     responses:
 *       200:
 *         description: Group details with teams
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 group:
 *                   $ref: '#/components/schemas/Group'
 *                 teams:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Team'
 *       400:
 *         description: Error getting group or no query declared
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/group', async(req,res) => {
    const ttl = 15 * 60 * 1000; // 15 minutes
    const cached = getRouteCached(req, ttl);
    if (cached) {
        res.setHeader('Cache-Control', 'public, max-age=900');
        return res.send(cached);
    }

    try{
        if(req.query.name == undefined){
            return res.status(400).send({
                error: 'Error no query declared'
            });
        };
        const group = await Group.findOne({name: req.query.name}).lean();
        const teams = await Team.find({group: group._id}).lean();
        const response = {group, teams};
        setRouteCached(req, response);
        res.setHeader('Cache-Control', 'public, max-age=900');
        return res.send(response);
    }catch(err){
        return res.status(400).send({
            error: `Error getting group with name: ${req.query.name}`
        });
    };
});

router.get('/groups', async(req,res) => {
    const ttl = 15 * 60 * 1000; // 15 minutes
    const cached = getRouteCached(req, ttl);
    if (cached) {
        res.setHeader('Cache-Control', 'public, max-age=900');
        return res.send(cached);
    }

    try{
        const groups = await Group.find().lean();
        const response = {groups};
        setRouteCached(req, response);
        res.setHeader('Cache-Control', 'public, max-age=900');
        return res.send(response);
    }catch(err){
        return res.status(400).send({
            error: 'Error getting all groups'
        });
    };
});


// Team Get Routes

/**
 * @swagger
 * /get/teams:
 *   get:
 *     summary: Get all teams
 *     description: Retrieve all teams or filter by group
 *     tags: [Teams]
 *     parameters:
 *       - in: query
 *         name: group
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter teams by group name (A-L)
 *         example: A
 *     responses:
 *       200:
 *         description: List of teams
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 teams:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Team'
 *                 group:
 *                   $ref: '#/components/schemas/Group'
 *       400:
 *         description: Error getting teams
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /get/team/{idTeam}:
 *   get:
 *     summary: Get team by ID
 *     description: Retrieve a specific team with group and games by ID
 *     tags: [Teams]
 *     parameters:
 *       - in: path
 *         name: idTeam
 *         required: true
 *         schema:
 *           type: string
 *         description: Team ID
 *     responses:
 *       200:
 *         description: Team details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 team:
 *                   $ref: '#/components/schemas/Team'
 *       400:
 *         description: Error getting team
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/team/:idTeam', async(req,res) => {
    const ttl = 15 * 60 * 1000; // 15 minutes
    const cached = getRouteCached(req, ttl);
    if (cached) {
        res.setHeader('Cache-Control', 'public, max-age=900');
        return res.send(cached);
    }

    try{
        const team = await Team.findById(req.params.idTeam).lean();
        const response = {team};
        setRouteCached(req, response);
        res.setHeader('Cache-Control', 'public, max-age=900');
        return res.send(response);
    }catch(err){
        return res.status(400).send({
            error: `Error getting team with id:${req.params.idTeam}`
        });
    };
});

/**
 * @swagger
 * /get/team:
 *   get:
 *     summary: Get team by name
 *     description: Retrieve a specific team with group and games by name
 *     tags: [Teams]
 *     parameters:
 *       - in: query
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Team name
 *         example: Brazil
 *     responses:
 *       200:
 *         description: Team details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 team:
 *                   $ref: '#/components/schemas/Team'
 *       400:
 *         description: Error getting team or no query declared
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/team', async(req,res) => {
    const ttl = 15 * 60 * 1000; // 15 minutes
    const cached = getRouteCached(req, ttl);
    if (cached) {
        res.setHeader('Cache-Control', 'public, max-age=900');
        return res.send(cached);
    }

    try{
        if(req.query.name == undefined){
            return res.status(400).send({
                error: 'Error no query declared'
            });
        };
        const name = req.query.name.charAt(0).toUpperCase() + req.query.name.slice(1);
        const team = await Team.findOne({name_en: name}).lean();
        const response = {team};
        setRouteCached(req, response);
        res.setHeader('Cache-Control', 'public, max-age=900');
        return res.send(response);
    }catch(err){
        return res.status(400).send({
            error: `Error getting team with name: ${req.query.name}`
        });
    };
});

router.get('/teams', async(req,res) => {
    const ttl = 15 * 60 * 1000; // 15 minutes
    const cached = getRouteCached(req, ttl);
    if (cached) {
        res.setHeader('Cache-Control', 'public, max-age=900');
        return res.status(200).json(cached);
    }

    console.log('GET /teams called');
    try{
        let teams;
        console.log('Query params:', req.query);
        if(req.query.group) {
            console.log('Filtering by group:', req.query.group);
            teams = await Team.find({groups: req.query.group.toUpperCase()}).lean();
        } else {
            console.log('Getting all teams...');
            teams = await Team.find({}).lean();
            console.log('Found teams:', teams.length);
        }
        const response = {teams};
        setRouteCached(req, response);
        res.setHeader('Cache-Control', 'public, max-age=900');
        console.log('Sending response...');
        return res.status(200).json(response);
    }catch(err){
        console.error('ERROR in /get/teams:', err);
        return res.status(400).json({
            error: 'Error getting all teams',
            details: err.message
        });
    }
});

// Game Get Routes

/**
 * @swagger
 * /get/games:
 *   get:
 *     summary: Get all games
 *     description: Retrieve all World Cup 2026 matches with team names
 *     tags: [Games]
 *     responses:
 *       200:
 *         description: List of all games with team names
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 games:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Game'
 *                       - type: object
 *                         properties:
 *                           home_team_name_en:
 *                             type: string
 *                             description: Home team English name
 *                           home_team_name_fa:
 *                             type: string
 *                             description: Home team Persian name
 *                           away_team_name_en:
 *                             type: string
 *                             description: Away team English name
 *                           away_team_name_fa:
 *                             type: string
 *                             description: Away team Persian name
 *       400:
 *         description: Error getting games
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/games', async(req,res) => {
    const ttl = 5 * 60 * 1000; // 5 minutes
    const cached = getRouteCached(req, ttl);
    if (cached) {
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.send(cached);
    }

    try{
        // Use lean() for faster queries
        const games = await Game.find({}).lean();

        // Get team map from cache
        const teamMap = await getTeamsMap();

        // Add team names to games
        const gamesWithNames = games.map(game => {
            if(game.home_team_id && teamMap[game.home_team_id]) {
                game.home_team_name_en = teamMap[game.home_team_id].name_en;
                game.home_team_name_fa = teamMap[game.home_team_id].name_fa;
                game.home_fifa_code = teamMap[game.home_team_id].fifa_code;
            }
            
            if(game.away_team_id && teamMap[game.away_team_id]) {
                game.away_team_name_en = teamMap[game.away_team_id].name_en;
                game.away_team_name_fa = teamMap[game.away_team_id].name_fa;
                game.away_fifa_code = teamMap[game.away_team_id].fifa_code;
            }
            
            return game;
        });

        const response = {games: gamesWithNames};
        setRouteCached(req, response);
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.send(response);
    }catch(err){
        return res.status(400).send({
            error: 'Error getting all games'
        });
    };
});

/**
 * @swagger
 * /get/game/{idGame}:
 *   get:
 *     summary: Get game by ID
 *     description: Retrieve a specific game with teams by ID
 *     tags: [Games]
 *     parameters:
 *       - in: path
 *         name: idGame
 *         required: true
 *         schema:
 *           type: string
 *         description: Game ID
 *     responses:
 *       200:
 *         description: Game details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 game:
 *                   $ref: '#/components/schemas/Game'
 *       400:
 *         description: Error getting game
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/game/:idGame', async(req,res) => {
    // Explicitly prevent caching for individual game details
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    try{
        const game = await Game.findById(req.params.idGame).lean();

        return res.send({game});
    }catch(err){
        return res.status(400).send({
            error: `Error getting game with id:${req.params.idGame}`
        })
    };
});

// Stadium Get Routes

/**
 * @swagger
 * /get/stadiums:
 *   get:
 *     summary: Get all stadiums
 *     description: Retrieve all World Cup 2026 stadiums
 *     tags: [Stadiums]
 *     responses:
 *       200:
 *         description: List of all stadiums
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stadiums:
 *                   type: array
 *       400:
 *         description: Error getting stadiums
 */
router.get('/stadiums', async(req,res) => {
    const ttl = 15 * 60 * 1000; // 15 minutes
    const cached = getRouteCached(req, ttl);
    if (cached) {
        res.setHeader('Cache-Control', 'public, max-age=900');
        return res.status(200).json(cached);
    }

    try{
        const stadiums = await Stadium.find().lean();
        const response = {stadiums};
        setRouteCached(req, response);
        res.setHeader('Cache-Control', 'public, max-age=900');
        return res.status(200).json(response);
    }catch(err){
        console.error('Error in /get/stadiums:', err);
        return res.status(400).json({
            error: 'Error getting all stadiums',
            details: err.message
        });
    }
});

/**
 * @swagger
 * /get/stadium/{id}:
 *   get:
 *     summary: Get stadium by ID
 *     description: Retrieve a specific stadium by ID
 *     tags: [Stadiums]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Stadium ID
 *     responses:
 *       200:
 *         description: Stadium details
 *       404:
 *         description: Stadium not found
 *       400:
 *         description: Error getting stadium
 */
router.get('/stadium/:id', async(req,res) => {
    const ttl = 15 * 60 * 1000; // 15 minutes
    const cached = getRouteCached(req, ttl);
    if (cached) {
        res.setHeader('Cache-Control', 'public, max-age=900');
        return res.status(200).json(cached);
    }

    try{
        const stadium = await Stadium.findOne({id: req.params.id}).lean();
        
        if (!stadium) {
            return res.status(404).json({
                error: `Stadium not found with id: ${req.params.id}`
            });
        }
        
        const response = {stadium};
        setRouteCached(req, response);
        res.setHeader('Cache-Control', 'public, max-age=900');
        return res.status(200).json(response);
    }catch(err){
        console.error('Error in /get/stadium:', err);
        return res.status(400).json({
            error: `Error getting stadium with id: ${req.params.id}`,
            details: err.message
        });
    }
});

module.exports = app => app.use('/get', router);
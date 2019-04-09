var state = 0; //-1: starting 0: not yet started, 1: day 2: night 3:game over
var dayStart = false;
var dayDuration = 60;
var nightDuration = 30;
var dayCount = 0;
var nightCount = 0;

//role definitions, to be moved to a JSON file at some point in the near future
var role_villager = {
    name: 'villager', //the role's reported name
    group: 'village', //group players assigned the role are affiliated with
    power: false //does the role have any special actions at nighttime
};

var role_cop = {
    name: 'cop',
    group: 'village',
    power: true
};

var role_doctor = {
    name: 'doctor',
    group: 'village',
    power: true
};

var role_mafioso = {
    name: 'mafioso',
    group: 'mafia',
    power: false
};
//end role definitions


var playerRoles = [
    role_villager,
    role_villager,
    role_villager,
    role_cop,
    role_doctor,
    role_mafioso,
    role_mafioso
];

function shuffle(array) {
    var m = array.length, t, i;

    while (m) {
        i = Math.floor(Math.random() * m--);

        t = array[m];
        array[m] = array[i];
        array[i] = t;
    }

    return array;
}

function assignRoles() {
    var players = [];
    io.sockets.clients((error, sockets) => {
        sockets.forEach(function (socket) {
            players.push(socket);
        });
    });
    players = shuffle(players);

    for (var i = 0; i < players.length; i++) {
        if (i <= playerRoles.length - 1) {
            players[i].game_alive = true;
            players[i].join('alive');
            players[i].game_role = playerRoles[i];
            players[i].join(playerRoles[i].group);
            players[i].emit('message', { message: 'You have been assigned the role of ' + playerRoles[i].name + '. You are part of the ' + playerRoles[i].group + '.' });
        } else {
            players[i].game_alive = false;
            players[i].join('spectator');
            players[i].emit('message', { message: 'Since the roles are full, you have been assigned the role of spectator.' });
        }
    }
}

function killPlayer(socket) {
    socket.game_alive = false;
    socket.leave('alive');

    if (state == 1) {
        io.sockets.emit('message', { message: socket.game_nickname + ', the ' + socket.game_role.name + ' was killed in the night!' });
    } else if (state == 2) {
        io.sockets.emit('message', { message: socket.game_nickname + ', the ' + socket.game_role.name + ' was lynched by the town!' });
    }

    socket.emit('disableField', false);
    socket.emit('displayVote', true);
    socket.emit('disableVote', true);

    socket.game_role = null;

    socket.leave('village');
    socket.leave('mafia');
    socket.join('spectator');
}


function endGame(winner) {
    state = 3;
    io.sockets.emit('header', { message: 'Game over' });
    io.sockets.emit('announcement', { message: winner + ' wins the game!' }); 0
    io.sockets.clients('alive', (error, sockets) => {
        if (error) throw error;
        sockets.forEach(function (socket) {
            killPlayer(socket);
        });
    })
}

var votes = [];
function countedVotes(arr) {
    var a = [], b = [], prev;
    arr.sort();
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] !== prev) {
            a.push(arr[i]);
            b.push(1);
        } else {
            b[b.length - 1]++;
        }
        prev = arr[i];
    }

    var results = [];

    for (var i = 0; i < a.length; i++) {
        results.push({ 'username': a[i], 'votes': b[i] });
    };

    results.sort(function (a, b) {
        return (b.votes - a.votes);
    });

    return results; //todo: randomize results if 2 players tie (currently sorts alphabetically)
}

function handleVotes() {
    io.of('/').in('').clients((error, sockets) => {
        if (error) throw error;
        if (!sockets.game_voted) {
            votes.push(null);
        }
    })
    var results = countedVotes(votes);
    io.of('/').in().clients((error, sockets) => {
        if (error) throw error;
        sockets.forEach(function (socket) {
            if (socket.game_nickname === results[0].username) {
                killPlayer(socket);
            }
        });
    })
    votes = [];
}

var endDay = false;

function dayLoop(duration, ticks) {
    var villageVictory = (io.of('/').in('mafia').clients().length === 0);
    var ticksLeft = duration - ticks;
    if (ticksLeft && !endDay) {
        io.sockets.emit('announcement', { message: 'Day ends in ' + ticksLeft + ' second(s)' });
        setTimeout(dayLoop, 100, duration, ticks + 1);
    } else if (villageVictory) {
        endGame('Village');
    } else {
        if (dayCount > 0 || nightCount > 0) {
            handleVotes();
        }
        nightCount++
        io.sockets.emit('header', { message: 'Night ' + nightCount });
        io.sockets.emit('announcement', { message: 'It is now nighttime' });

        io.sockets.in('mafia').emit('clearTargets');
        //asynchronous idiots here
        io.of('/').in('village').clients((error, clients) => {
            if (error) throw error;
            clients.forEach(function (socket) {
                socket.emit('disableField', true);
                socket.emit('displayVote', false);
                io.sockets.in('mafia').emit('validTarget', socket.game_nickname);
            });
        });

        var votingPlayers = [];
        io.of('/').in('mafia').clients((error, clients) => {
            if (error) throw error;
            clients.forEach(function (socket) {
                votingPlayers.push(socket.game_nickname);
                socket.game_voted = false;
            })
        });

        io.sockets.in('mafia').emit('votingPlayers', votingPlayers);

        setTimeout(nightLoop, 100, nightDuration, 0);
        state = 1;
    }
}

function nightLoop(duration, ticks) {
    var mafiaCount = io.of('/').in('mafia').clients().length;
    var villageCount = io.of('/').in('village').clients().length;
    // var mafiaVictory = (io.sockets.clients('mafia') >= io.sockets.clients('village'));
    var mafiaVictory = (mafiaCount >= villageCount);
    var ticksLeft = duration - ticks;
    if (ticksLeft) {
        io.sockets.emit('announcement', { message: 'Night ends in ' + ticksLeft + ' second(s)' });
        setTimeout(nightLoop, 100, duration, ticks + 1);
    } else if (mafiaVictory) {
        endGame('Mafia');
    } else {
        if (dayCount > 0 || nightCount > 0) {
            handleVotes();
        }
        dayCount++;
        io.sockets.emit('header', { message: 'Day ' + dayCount });
        io.sockets.emit('announcement', { message: 'It is now daytime' });
        io.sockets.in('alive').emit('disableField', false);
        io.sockets.in('alive').emit('displayVote', true);

        io.sockets.in('alive').emit('clearTargets');
        // asynchronus idiots here 
        io.of('/').in('alive').clients((error, clients) => {
            if (error) throw error;
            clients.forEach(function (socket) {
                io.sockets.in('alive').emit('validTarget', socket.game_nickname);
            });
        })
        var votingPlayers = [];
        io.of('/').in('alive').clients((error, clients) => {
            if (error) throw error;
            clients.forEach(function (socket) {
                votingPlayers.push(socket.game_nickname);
                socket.game_voted = false;
            })
        });

        io.sockets.in('mafia').emit('votingPlayers', votingPlayers);

        setTimeout(dayLoop, 100, dayDuration, 0);
        state = 2;
        endDay = false;
    }
}


function initialize() {
    assignRoles();
    if (dayStart) {
        dayLoop(0, 0);
    } else {
        io.sockets.in('mafia').emit('displayVote', true);
        nightLoop(0, 0);
    }
}

var startingCountdownTimer = null;

function startingCountdown(duration, ticks) {
    ticksLeft = duration - ticks;
    if (ticksLeft) {
        io.sockets.emit('announcement', { message: 'Game starting in ' + ticksLeft + ' second(s)' });
        startingCountdownTimer = setTimeout(startingCountdown, 50, duration, ticks + 1);
    } else {
        io.sockets.emit('announcement', { message: 'Game starting now' });
        initialize();
    }
}

function hasEveryoneVoted() {
    var votedFlag = true;
    if (state == 1) {
        io.sockets.clients('mafia').forEach(function (socket) {
            if (!socket.game_voted) {
                votedFlag = false;
            }
        });
    } else if (state == 2) {
        io.sockets.clients('alive').forEach(function (socket) {
            if (!socket.game_voted) {
                votedFlag = false;
            }
        });
    }

    return votedFlag;
}


module.exports = {
    checkNumPlayers: function () {
        var validClients = null;
        var lengthy = 0;
        io.sockets.clients((error, clients) => {
            if (error) throw error;
            lengthy = clients.length;
            console.log(lengthy);
            validClients = clients.filter(function (socket) {
                return (socket.game_nickname);
            })
            var numClients = lengthy;//validClients.length; //=0
            var reqPlayers = playerRoles.length;
            console.log(reqPlayers, lengthy);

            if (numClients >= reqPlayers) {
                io.sockets.emit('announcement', { message: 'Required number of players reached' });
                state = -1;
                startingCountdownTimer = setTimeout(startingCountdown, 1000, 10, 0);
            } else {
                io.sockets.emit('announcement', { message: 'Waiting on ' + (reqPlayers - numClients) + ' more players' });
                clearTimeout(startingCountdownTimer);
            }
        });

        // var numClients = lengthy;//validClients.length; //=0
        // var reqPlayers = playerRoles.length;
        //  console.log(reqPlayers, lengthy);

        // if (numClients >= reqPlayers) {
        //     io.sockets.emit('announcement', { message: 'Required number of players reached' });
        //     startingCountdownTimer = setTimeout(startingCountdown, 1000, 10, 0);
        // } else {
        //     io.sockets.emit('announcement', { message: 'Waiting on ' + (reqPlayers - numClients) + ' more players' });
        //     clearTimeout(startingCountdownTimer);
        // }
        io.sockets.emit('header', { message: 'Pre-game Lobby' });
    },
    filterMessage: function (socket, data) {
        var clientRooms = Object.keys(io.sockets.adapter.rooms[socket.id]);
        console.log(clientRooms);
        if (clientRooms['/spectator'] || !socket.game_alive) {
            data.message = '<font color="red">' + data.message + '</font>';
            io.sockets.in('spectator').emit('message', data);
        } else if (state == 1) {
            if (clientRooms['/mafia']) {
                io.sockets.in('mafia').emit('message', data);
            }
        } else {
            io.sockets.emit('message', data);
        }
    },
    vote: function (socket, data) {
        //check if vote is valid then register it
        data.username = socket.game_nickname;
        var isValid = true;
        var clientRooms = Object.keys(io.sockets.adapter.rooms[socket.id]);
        console.log(clientRooms);
        if (state == 1 && clientRooms['/mafia']) {
            io.sockets.in('mafia').emit('playerVote', data);
        } else if (state == 2) {
            io.sockets.emit('playerVote', data);
        }
        else {
            isValid = false;
        }
        if (isValid) {
            socket.game_voted = true;
            votes.push(data.message);
            if (hasEveryoneVoted()) {
                endDay = true;
            }
        }
    },
    state: function () {
        return state;
    }
}
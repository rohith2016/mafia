var state = 0; //0: not yet started, 1: day 2: night
var dayStart = false;
var dayDuration = 60;
var nightDuration = 30;
var dayCount = 0;
var nightCount = 0;

var playerRoles = [
    { role: 'villager', group: 'village' },
    { role: 'villager', group: 'village' },
    { role: 'villager', group: 'village' },
    { role: 'cop', group: 'village' },
    { role: 'doctor', group: 'village' },
    { role: 'mafioso', group: 'mafia' },
    { role: 'mafioso', group: 'mafia' }
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
    io.sockets.clients().forEach(function (socket) {
        players.push(socket);
    });
    players = shuffle(players);

    for (var i = 0; i < players.length; i++) {
        if (i <= playerRoles.length - 1) {
            players[i].join(playerRoles[i].role);
            players[i].join(playerRoles[i].group);
            players[i].emit('message', { message: 'You have been assigned the role of ' + playerRoles[i].role + '. You are affiliated with the ' + playerRoles[i].group + '.' });
        } else {
            players[i].join('spectator');
            players[i].emit('message', { message: 'Since the roles are full, you have been assigned the role of spectator.' });
        }
    }
}

function dayLoop(duration, ticks) {
    var ticksLeft = duration - ticks;
    if (ticksLeft) {
        io.sockets.emit('announcement', { message: 'Day ends in ' + ticksLeft + ' second(s)' });
        setTimeout(dayLoop, 1000, duration, ticks + 1);
    } else {
        nightCount++
        io.socket.emit('header', { message: 'Night ' + nightCount });
        io.sockets.emit('announcement', { message: 'It is now nighttime' });

        io.sockets.in('mafia').emit('clearTargets');

		io.sockets.clients('village').forEach(function (socket) {
			socket.emit('disableField', true);
			socket.emit('displayVote', false);
			io.sockets.in('mafia').emit('validTarget', socket.id);
		});


        setTimeout(nightLoop, 1000, nightDuration, 0);
        state = 1;
    }
}

function nightLoop(duration, ticks) {
    var ticksLeft = duration - ticks;
    if (ticksLeft) {
        io.sockets.emit('announcement', { message: 'Night ends in ' + ticksLeft + ' second(s)' });
        setTimeout(nightLoop, 1000, duration, ticks + 1);
    } else {
        dayCount++;
        io.sockets.emit('header', { message: 'Day ' + dayCount });
        io.sockets.emit('announcement', { message: 'It is now daytime' });
        io.sockets.emit('disableField', false);
        io.sockets.clients().forEach(function (socket) {
			io.sockets.emit('validTarget', socket.id);
		});
        setTimeout(dayLoop, 1000, dayDuration, 0);
        state = 2;
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

function startingCountdown(duration, ticks) {
    ticksLeft = duration - ticks;
    if (ticksLeft) {
        io.sockets.emit('announcement', { message: 'Game starting in ' + ticksLeft + ' second(s)' });
        setTimeout(startingCountdown, 1000, duration, ticks + 1);
    } else {
        io.sockets.emit('announcement', { message: 'Game starting now' });
        initialize();
    }
}
//var room = "room 1";
module.exports = {
    checkNumPlayers: function () {
        var numClients = io.sockets.clients().length; //=0
        // io.to('room1').clients((error, clients)=>{
        //     if(error) throw error;
        //     numClients = clients.length;
        //     console.log('herhe');
        // })
        //var numClients = Object.keys(socket.room).length;
        var reqPlayers = playerRoles.length;
        console.log(reqPlayers, numClients);

        if (numClients >= reqPlayers) {
            io.sockets.emit('announcement', { message: 'Required number of players reached' });
            setTimeout(startingCountdown, 1000, 10, 0);
        } else {
            io.sockets.emit('announcement', { message: 'Waiting on ' + (reqPlayers - numClients) + ' more players' });
        }
        io.sockets.emit('header', { message: 'Pre-game Lobby' });
    },
    filterMessage: function (socket, data) {
        if (state == 1) {
            var clientRooms = io.sockets.manager.roomClients[socket.id];
            if (clientRooms['/mafia']) {
                io.sockets.in('mafia').emit('message', data);
            }
        } else {
            io.sockets.emit('message', data);
        }
    },
    state: function () {
        return state;
    }
}
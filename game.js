var state = 0; //0: not yet started, 1: running

 var playerRoles = [
	{role: 'villager', group: 'village'},
	{role: 'villager', group: 'village'},
	{role: 'villager', group: 'village'},
	{role: 'cop', group: 'village'},
	{role: 'doctor', group: 'village'},
	{role: 'mafioso', group: 'mafia'},
	{role: 'mafioso', group: 'mafia'}
];

 function shuffle (array) {
	var m = array.length, t, i;

 	while (m) {
		i = Math.floor(Math.random() * m--);

 		t = array[m];
		array[m] = array[i];
		array[i] = t;
	}

 	return array;
}

 function assignRoles () {
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
};

 function initialize () {
	assignRoles();
	state = 1;
};

 function startingCountdown (duration, ticks) {
	ticksLeft = duration - ticks;
	if (ticksLeft) {
		io.sockets.emit('announcement', { message: 'Game starting in ' + ticksLeft + ' second(s)'});
		setTimeout(startingCountdown, 1000, duration, ticks + 1);
	} else {
		io.sockets.emit('announcement', { message: 'Game starting now'});
		initialize();
	}
};

 module.exports = {
	checkNumPlayers: function() {
		var numClients = io.sockets.clients().length;
		var reqPlayers = playerRoles.length;
		if(numClients >= reqPlayers) {
			io.sockets.emit('announcement', { message: 'Required number of players reached'});
			setTimeout(startingCountdown, 1000, 10, 0);
		} else {
			io.sockets.emit('announcement', { message: 'Waiting on ' + (reqPlayers - numClients) + ' more players'});
		}
	},
	state: function() {
		return state;
	}
}
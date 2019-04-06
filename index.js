var express = require("express");
var app = express();
var port = 8080;

 app.set('views', __dirname + '/views');
app.set('view engine', "pug");
app.engine('pug', require('pug').__express);
app.get("/", function(req, res){
	res.render("index");
});

 app.use(express.static(__dirname + '/public'));

 var io = require('socket.io').listen(app.listen(port));
console.log("Listening on port " + port);

 io.sockets.on('connection', function (socket) {
	socket.emit('message', { message: 'welcome to the chat' });
	socket.on('send', function (data) {
		io.sockets.emit('message', data);
	});
});

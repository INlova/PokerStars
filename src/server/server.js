const express = require('express');
const socketIo = require('socket.io');
const controllers = require('./controllers');
const logger = require('morgan');

const tables = require('./tables');
const pokerEngine = require('../engine');

const app = express();
const server = app.listen(6701, () => {
    console.log('Listening on port 6701');
});

const io = socketIo(server);

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept');
    next();
});

app.use(logger('tiny'));
app.use(express.json());
app.use(express.static('dist'));
app.use('/api', controllers);
app.set('io', io);

io.on('connection', (socket) => {
    const getTableId = () => Object.keys(socket.rooms).filter(room => room !== socket.id)[0];

    const startNewDeal = () => {
        const tableId = getTableId();
        const table = tables.getById(tableId);
        const { currentDraw } = table;
        const { seats } = currentDraw;

        if (seats.filter(seat => seat).length > 1 && !currentDraw.hasStarted) {
            currentDraw.hasStarted = true;

            const seatsIndices = [];
            seats.forEach((seat, index) => {
                if (seat) seatsIndices.push(index);
            });

            let nextPlayerIndex = seatsIndices.findIndex(i => i > currentDraw.playerInTurn);
            if (nextPlayerIndex === -1) nextPlayerIndex = 0;
            currentDraw.playerInTurn = seatsIndices[nextPlayerIndex];

            const bigBlindIndex = seatsIndices[((nextPlayerIndex - 1) + seatsIndices.length) % seatsIndices.length];
            const smallBlindIndex = seatsIndices[((nextPlayerIndex - 2) + seatsIndices.length) % seatsIndices.length];

            seats[smallBlindIndex].bet = 10;
            seats[smallBlindIndex].chips -= 10;

            seats[bigBlindIndex].bet = 10;
            seats[bigBlindIndex].chips -= 20;

            io.to(tableId).emit('getRoom', table);

            const alreadyGeneratedCards = new Set();
            seats.forEach((seat) => {
                if (seat) {
                    seat.cards = pokerEngine.generateCards(2, alreadyGeneratedCards)
                        .map(card => card.signature);

                    io.to(seat.playerId).emit('updatePlayer', {
                        seatNumber: seat.seatNumber,
                        player: seat,
                    });
                }
            });
        }
    };

    socket.on('getTables', () => {
        socket.emit('getTables', tables.list().map(table => tables.toSimpleViewModel(table)));
    });

    socket.on('newTable', (table) => {
        const newTable = tables.add(table);

        io.emit('newTable', tables.toSimpleViewModel(newTable));
    });

    socket.on('getRoom', (tableId) => {
        let table = tables.getById(tableId);

        if (table) {
            table = { ...table };
            table.currentDraw.seats.forEach((seat) => {
                if (seat) {
                    seat.cards[0] = null;
                    seat.cards[1] = null;
                }
            });

            socket.join(tableId);
        }

        socket.emit('getRoom', table);
    });

    socket.on('newPlayer', (player) => {
        const tableId = getTableId();
        const table = tables.getById(tableId);

        // If there is no such table or the seat is taken or the user is already playing on this table
        if (!table ||
            table.currentDraw.seats[player.seatNumber] ||
            tables.getPlayerSeatIndex(tableId, socket.id) !== -1) {
            socket.emit('error', { message: 'You cannot join this seat!' });
            return;
        }

        const newPlayer = tables.addPlayer(tableId, player.seatNumber, player, socket.id);

        io.to(tableId).emit('updatePlayer', {
            seatNumber: newPlayer.seatNumber,
            player: newPlayer,
        });

        io.emit('newTable', tables.toSimpleViewModel(table));

        startNewDeal();
    });

    socket.on('leaveRoom', () => {
        const tableId = getTableId();
        const table = tables.getById(tableId);

        if (!table) {
            socket.emit('error', { message: 'There is no such table!' });
            return;
        }

        const seatNumber = tables.getPlayerSeatIndex(tableId, socket.id);

        if (seatNumber === -1) {
            socket.emit('error', { message: 'You are not playing on this table!' });
            return;
        }

        tables.addPlayer(tableId, seatNumber, null);
        socket.leave(tableId);
        io.to(tableId).emit('updatePlayer', {
            seatNumber,
            player: null,
        });

        io.emit('newTable', tables.toSimpleViewModel(table));
    });
});

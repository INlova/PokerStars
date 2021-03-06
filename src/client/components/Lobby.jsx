import React, { Component } from 'react';
import PropTypes from 'prop-types';
import CreateTable from './CreateTable';
import * as socket from '../services/socket';

export default class Lobby extends Component {
    static propTypes = {
        history: PropTypes.shape({
            push: PropTypes.func.isRequired,
        }).isRequired,
    };

    constructor(props) {
        super(props);

        this.state = {
            tables: new Map(),
        };
    }

    componentDidMount() {
        socket.subscribeForEvent('getTables', this.getAllTables);
        socket.subscribeForEvent('newTable', this.updateTable);

        socket.emitEvent('getTables');
    }

    componentWillUnmount() {
        socket.unsubscribeForEvent('getTables', this.getAllTables);
        socket.unsubscribeForEvent('newTable', this.updateTable);
    }

    getAllTables = (tables) => {
        const tablesMap = new Map();
        tables.forEach(table => tablesMap.set(table.id, table));

        this.setState({ tables: tablesMap });
    };

    updateTable = (response) => {
        const tables = this.state.tables;
        tables.set(response.tableId, response.table);

        this.setState({ tables });
    };

    createNewTable = (name, password) => {
        socket.emitEvent('newTable', { name, password });
    };

    joinTable = (tableId) => {
        this.props.history.push(`table/${tableId}`);
    };

    render() {
        const tables = Array.from(this.state.tables)
            .filter(([id, table]) => id && table)
            .map(([id, table]) => (
                <div key={id} style={{ border: '1px solid black', width: '20%', margin: '2% 1%', padding: '1%', display: 'inline-block', position: 'relative' }}>
                    {table.isLocked && <span style={{ position: 'absolute', top: '5%', right: '5%' }}>Locked</span>}
                    <div>{table.name}</div>
                    <ul>
                        {table.players.map(player => (
                            <li key={player.playerId}>{player.playerName}</li>
                        ))}
                    </ul>
                    <button onClick={() => { this.joinTable(table.id); }}>Join</button>
                </div>
            ));

        return (
            <div>
                <div>{tables}</div>
                <CreateTable createTable={this.createNewTable} />
            </div>
        );
    }
}

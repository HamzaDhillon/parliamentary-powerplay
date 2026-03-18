# Parliamentary Powerplay

A real-time multiplayer parliamentary simulation game built with React, TypeScript, and Bun.

## Game Overview

Parliamentary Powerplay is a strategic political simulation where players lead political parties and compete to form governments, pass legislation, and maintain power in a dynamic parliamentary system.

## Features

- **Real-time Multiplayer**: Join sessions with 3-5 players using a 4-letter lobby code
- **Party Management**: Select and lead political parties with different ideologies and seat counts
- **Coalition Building**: Form alliances and negotiate with other party leaders
- **Government Formation**: Build coalitions to reach the 170-seat majority threshold
- **Legislative Process**: Propose, debate, and vote on bills including budgets and no-confidence motions
- **Constitutional Crises**: Handle political crises when governments fall or budgets are defeated
- **Snap Elections**: Trigger elections to redistribute seats and reset the political landscape

## Game Mechanics

### Government Formation
- Form a government by reaching 170+ seats through coalition building
- Only the Prime Minister can request dissolution of Parliament
- Minority governments are possible but vulnerable to no-confidence motions

### Legislative Process
- **Regular Bills**: Standard legislation requiring simple majority (170+ seats)
- **Budget Bills**: Critical legislation - defeat triggers constitutional crisis
- **No-Confidence Motions**: Challenge existing governments
- **Dissolution Requests**: PM can request Parliament dissolution (requires vote)

### Constitutional Crises
- **Budget Defeated**: Government must resign or call election
- **No-Confidence Passed**: Government falls, new government must form
- **PM Dissolution**: Request Parliament dissolution (subject to vote)

## Technical Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS
- **Backend**: Bun WebSocket server
- **State Management**: React hooks and context
- **Real-time Communication**: WebSocket protocol

## Installation

### Prerequisites
- Node.js (version 18 or higher)
- Bun (JavaScript runtime)

### Setup

1. Clone this repository:
   ```bash
   git clone <your-repository-url>
   cd parliamentary-powerplay
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Start the development server:
   ```bash
   bun dev
   ```

4. Start the WebSocket server:
   ```bash
   bun run src/server/index.ts
   ```

5. Open your browser and navigate to `http://localhost:5173`

## Project Structure

```
parliamentary-powerplay/
├── src/
│   ├── components/          # React components
│   ├── data/               # Game data (parties, configurations)
│   ├── hooks/              # Custom React hooks
│   ├── logic/              # Game logic and utilities
│   ├── server/             # WebSocket server
│   ├── types/              # TypeScript type definitions
│   └── App.tsx             # Main application component
├── public/                 # Static assets
├── package.json            # Project dependencies
└── README.md              # This file
```

## Game Rules

### Seat Distribution
- Total seats: 338
- Majority threshold: 170 seats
- Parties are randomly distributed with 25-169 seats each
- No single party starts with a majority

### Party Selection
- Each player selects one party to lead
- Party leaders control voting and coalition decisions
- Only one leader per party

### Coalition Mechanics
- Parties in the same coalition share seat counts
- Coalition leaders can invite other parties to join
- Accepting an invitation leaves current coalitions

### Voting System
- Bills are voted on by seat-weighted voting
- Each party's vote counts as their seat total
- Simple majority (170+ seats) required for most bills

## Development

### Adding New Features
1. Create new components in `src/components/`
2. Add TypeScript types in `src/types/`
3. Update game logic in `src/logic/`
4. Test thoroughly with multiple players

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test the changes
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support or questions about the game:
- Create an issue on GitHub
- Check the project documentation
- Review the code comments for implementation details

## Future Development

Planned features:
- AI opponents for single-player mode
- Historical party data and real-world scenarios
- Advanced economic simulation
- Policy impact modeling
- Campaign management mechanics
# Parliamentary Powerplay

A real-time multiplayer parliamentary simulation game built with React, TypeScript, and Bun.

## 🎮 Game Overview

Parliamentary Powerplay is a strategic multiplayer game where players lead political parties, form coalitions, pass legislation, and navigate constitutional crises in a simulated parliamentary system.

### Key Features

- **Real-time Multiplayer**: Up to 5 players per session with WebSocket communication
- **Party Management**: Claim leadership of political parties with different ideologies
- **Coalition Building**: Form alliances and negotiate power-sharing agreements
- **Legislative Process**: Propose bills, vote on legislation, and trigger constitutional crises
- **Government Formation**: Declare governments and challenge existing administrations
- **Snap Elections**: Trigger elections through no-confidence motions or budget defeats

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh) (version 1.0.0 or higher)
- Node.js (for development)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd parliamentary-powerplay
```

2. Install dependencies:
```bash
bun install
```

### Running Locally

1. **Start the Backend Server**:
```bash
cd src/server
bun index.ts
```

2. **Start the Frontend**:
```bash
bun run dev
```

3. Open your browser and navigate to `http://localhost:5173`

## 🏗️ Architecture

### Frontend (React + TypeScript)
- **Location**: `src/`
- **Framework**: React 19 with Vite
- **Styling**: Tailwind CSS
- **State Management**: React hooks (useState, useEffect, useMemo, useCallback)

### Backend (Bun WebSocket Server)
- **Location**: `src/server/`
- **Runtime**: Bun
- **Protocol**: WebSocket
- **Features**: Real-time message broadcasting, lobby management

### Key Components

- **App.tsx**: Main game logic and WebSocket message handling
- **useSocket.ts**: WebSocket connection management hook
- **PartyGrid.tsx**: Party selection and display component
- **server/index.ts**: WebSocket server implementation

## 🎯 Game Mechanics

### Party System
- 3-5 parties per game session
- Random seat distribution (25-169 seats per party)
- 338 total seats in parliament
- 170 seats required for majority

### Government Formation
- Players declare governments with coalition partners
- Majority required (170+ seats) to form government
- Prime Minister leads the government
- Government can be challenged by other coalitions

### Legislative Process
- **Bill Proposals**: Players can introduce legislation
- **Budget Bills**: Special bills that trigger crises if defeated
- **No-Confidence Motions**: Challenge existing governments
- **Dissolution Requests**: Prime Minister can request snap elections

### Voting System
- Seat-weighted voting (each party's vote counts as their seat count)
- Real-time vote tracking
- Majority required for passage (170+ seats)

### Constitutional Crises
- **Budget Defeat**: Government budget loses → constitutional crisis
- **No-Confidence Passed**: Government loses confidence → crisis
- **Resolution Options**: Resign government or call snap election

## 🌐 Deployment

### Frontend (Already Deployed on Vercel)
The frontend is already deployed on Vercel. The build configuration is in `vercel.json`.

### Backend Deployment Options

#### Option 1: Vercel Serverless Functions (Recommended)
1. Create a new Vercel project for the backend
2. Configure the project to use the `server/` directory
3. Set environment variables:
   - `PORT`: 3000 (or leave default)
   - `NODE_ENV`: production

#### Option 2: Railway
1. Create a new Railway project
2. Connect your GitHub repository
3. Set the working directory to `server/`
4. Add environment variables as needed

#### Option 3: Render
1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set the build command to `bun install` and start command to `bun index.ts`
4. Set the working directory to `server/`

#### Option 4: Fly.io
1. Install Fly.io CLI
2. Run `fly launch` in the `server/` directory
3. Configure the app to use Bun runtime

### Environment Configuration

After deploying the backend, update your frontend environment:

1. **For Vercel deployment**:
   - Go to your Vercel dashboard
   - Select your frontend project
   - Add environment variable: `VITE_WS_URL=ws://your-backend-url/ws`

2. **For local development**:
   - Copy `.env.example` to `.env.local`
   - Update `VITE_WS_URL` with your backend URL

## 🔧 Development

### Project Structure
```
parliamentary-powerplay/
├── src/
│   ├── components/     # React components
│   ├── data/          # Game data (parties, etc.)
│   ├── hooks/         # Custom React hooks
│   ├── server/        # Backend WebSocket server
│   ├── types/         # TypeScript type definitions
│   └── App.tsx        # Main application
├── public/            # Static assets
├── server/            # Backend deployment files
└── src/server/        # Backend source code
```

### Available Scripts

**Frontend:**
- `bun run dev`: Start development server
- `bun run build`: Build for production
- `bun run lint`: Run ESLint
- `bun run preview`: Preview production build

**Backend:**
- `bun index.ts`: Start the server
- `bun --watch index.ts`: Start with file watching

### Adding New Features

1. **Game Logic**: Modify `src/App.tsx` for new game mechanics
2. **WebSocket Messages**: Add new message types in both frontend and backend
3. **UI Components**: Create new components in `src/components/`
4. **Types**: Update type definitions in `src/types/`

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🐛 Troubleshooting

### Common Issues

**WebSocket Connection Failed**:
- Ensure backend server is running
- Check that ports are not blocked by firewall
- Verify WebSocket URL in environment variables

**Build Errors**:
- Ensure Bun is installed and up to date
- Run `bun install` to refresh dependencies
- Check TypeScript configuration

**Deployment Issues**:
- Verify environment variables are set correctly
- Check that the correct runtime (Bun) is configured
- Ensure proper file structure for your deployment platform

## 📞 Support

For support and questions:
- Create an issue on GitHub
- Join our Discord server (if available)
- Email the maintainer

---

**Enjoy the game and may the best coalition win!** 🏛️
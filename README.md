# HalluciFix

<div align="center">
  <img src="https://img.shields.io/badge/React-18.3.1-blue?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.5.3-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-5.4.2-646CFF?logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/Supabase-2.55.0-3ECF8E?logo=supabase" alt="Supabase" />
  <img src="https://img.shields.io/badge/Tailwind-3.4.1-38B2AC?logo=tailwind-css" alt="Tailwind CSS" />
</div>

## 🛡️ AI Accuracy Verification Engine

HalluciFix is a comprehensive platform designed to detect and analyze hallucinations in AI-generated content. It provides real-time verification, risk assessment, and automated monitoring tools to ensure content accuracy and reliability.

## ✨ Key Features

### 🔍 Content Analysis
- **Single Analysis**: Real-time detection of hallucinations in individual content pieces
- **Batch Processing**: Bulk analysis of multiple documents and files
- **Seq-Logprob Analysis**: Advanced token probability analysis for deep insights
- **PDF Processing**: Extract and analyze content from PDF documents

### 📊 Monitoring & Analytics
- **Scheduled Scans**: Automated monitoring with configurable frequency
- **Risk Assessment**: Multi-level categorization (low, medium, high, critical)
- **Analytics Dashboard**: Historical trends and performance metrics
- **Real-time Reporting**: Live updates on analysis results

### 👥 Collaboration & Management
- **Content Reviews**: Workflow for reviewing and approving flagged content
- **User Management**: Role-based access control with admin capabilities
- **Team Collaboration**: Multi-user support with permission levels
- **API Integration**: RESTful API for external system integration

### 🎨 User Experience
- **Dark Mode**: Full dark/light theme support
- **Responsive Design**: Optimized for desktop and mobile devices
- **Intuitive Interface**: Clean, modern UI with accessibility features
- **Real-time Updates**: Live notifications and status updates

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Supabase account and project
- Google Cloud credentials (for Drive integration)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/hallucifix.git
   cd hallucifix
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment setup**
   ```bash
   cp .env.example .env.local
   ```
   
   Configure your environment variables:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Database setup**
   ```bash
   # Run Supabase migrations
   npx supabase db push
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

Visit `http://localhost:5173` to access the application.

## 🏗️ Architecture

### Frontend Stack
- **React 18** with TypeScript for type safety
- **Vite** for fast development and building
- **Tailwind CSS** for utility-first styling
- **Lucide React** for consistent iconography

### Backend & Database
- **Supabase** for authentication, database, and real-time features
- **PostgreSQL** with custom functions for scheduled processing
- **Edge Functions** for serverless compute (Deno runtime)

### Key Integrations
- **Google Drive API** for document access
- **PDF Processing** for document analysis
- **Real-time Subscriptions** for live updates

## 📁 Project Structure

```
hallucifix/
├── src/
│   ├── components/          # React components
│   │   ├── HallucinationAnalyzer.tsx
│   │   ├── Dashboard.tsx
│   │   ├── BatchAnalysis.tsx
│   │   └── ...
│   ├── hooks/              # Custom React hooks
│   │   ├── useAuth.ts
│   │   ├── useDarkMode.ts
│   │   └── useToast.ts
│   ├── lib/                # Services and utilities
│   │   ├── supabase.ts
│   │   ├── analysisService.ts
│   │   └── ...
│   ├── types/              # TypeScript type definitions
│   │   ├── analysis.ts
│   │   ├── user.ts
│   │   └── ...
│   └── App.tsx             # Main application component
├── supabase/
│   ├── migrations/         # Database migrations
│   └── functions/          # Edge functions
├── docs/                   # Documentation
└── .kiro/                  # AI assistant configuration
```

## 🔧 Development

### Available Scripts

```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build

# Code Quality
npm run lint         # Run ESLint
npm run test         # Run tests
npm run test:ui      # Run tests with UI
```

### Code Style
- **ESLint** with TypeScript support
- **Prettier** for code formatting
- **Conventional Commits** for commit messages
- **Component-based** architecture

### Testing
- **Vitest** for unit and integration tests
- **Testing Library** for component testing
- **Coverage reports** with v8

## 📊 Key Metrics

### Accuracy Scoring
- **0-70%**: Critical risk - Immediate attention required
- **70-80%**: High risk - Review recommended
- **80-90%**: Medium risk - Monitor closely
- **90-100%**: Low risk - Content likely accurate

### Performance Targets
- **Analysis Speed**: < 2 seconds for single content
- **Batch Processing**: 100+ documents per minute
- **Uptime**: 99.9% availability
- **Response Time**: < 200ms for API calls

## 🔐 Security & Privacy

- **Authentication**: Supabase Auth with JWT tokens
- **Authorization**: Role-based access control (RBAC)
- **Data Encryption**: End-to-end encryption for sensitive data
- **Privacy**: GDPR compliant data handling
- **Audit Logs**: Comprehensive activity tracking

## 🌐 API Reference

### Authentication
```bash
POST /auth/login
POST /auth/logout
GET /auth/user
```

### Analysis Endpoints
```bash
POST /api/analyze          # Single content analysis
POST /api/analyze/batch    # Batch analysis
GET /api/results          # Get analysis results
```

### Scheduled Scans
```bash
GET /api/scans            # List scheduled scans
POST /api/scans           # Create new scan
PUT /api/scans/:id        # Update scan
DELETE /api/scans/:id     # Delete scan
```

## 🚀 Deployment

### Production Build
```bash
npm run build
```

### Environment Variables
```env
VITE_SUPABASE_URL=your_production_supabase_url
VITE_SUPABASE_ANON_KEY=your_production_anon_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### Hosting Options
- **Vercel** (Recommended)
- **Netlify**
- **AWS Amplify**
- **Self-hosted** with Docker

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Write tests for new features
- Update documentation as needed
- Follow the existing code style

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [docs/](./docs/)
- **Issues**: [GitHub Issues](https://github.com/your-org/hallucifix/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/hallucifix/discussions)
- **Email**: support@hallucifix.com

## 🗺️ Roadmap

- [ ] Advanced ML model integration
- [ ] Multi-language support
- [ ] Enterprise SSO integration
- [ ] Advanced analytics and reporting
- [ ] Mobile application
- [ ] API rate limiting and quotas

---

<div align="center">
  <p>Built with ❤️ by the HalluciFix Team</p>
  <p>
    <a href="https://hallucifix.com">Website</a> •
    <a href="https://docs.hallucifix.com">Documentation</a> •
    <a href="https://twitter.com/hallucifix">Twitter</a>
  </p>
</div>

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a DMARC Report Dashboard application built with React, TypeScript, and Vite. It allows users to upload, parse, and analyze DMARC XML reports to monitor email authentication and security posture.

## Key Technologies

- **Frontend**: React 18, TypeScript, Vite
- **UI Components**: shadcn/ui with Radix UI primitives
- **Styling**: Tailwind CSS with custom design system
- **Authentication**: Supabase Auth
- **Database**: Supabase (PostgreSQL)
- **Data Fetching**: TanStack Query (React Query)
- **Routing**: React Router v6
- **XML Parsing**: xml2js
- **Charts**: Recharts

## Common Development Commands

```bash
# Install dependencies
npm install

# Start development server (runs on localhost:8080)
npm run dev

# Build for production
npm run build

# Build for development
npm run build:dev

# Lint code
npm run lint

# Preview production build
npm run preview
```

## Architecture

### Database Schema
The application uses Supabase with the following key tables:
- `dmarc_reports` - Main report metadata and policy information
- `dmarc_records` - Individual record data from DMARC reports
- `dmarc_auth_results` - Authentication results (DKIM/SPF) for each record
- `user_domains` - User-associated domains for multi-tenancy

### Core Application Structure

- **Authentication Flow**: Uses Supabase Auth with `useAuth` hook and `ProtectedRoute` component
- **Data Layer**: `useDmarcData` hook handles all DMARC-related data fetching and state management
- **XML Processing**: `dmarcParser.ts` parses DMARC XML files into structured data
- **Database Operations**: `dmarcDatabase.ts` handles Supabase operations for storing parsed reports

### Key Components

- `Dashboard.tsx` - Main dashboard with metrics and charts
- `Upload.tsx` - File upload interface for DMARC XML files
- `ReportDetail.tsx` - Detailed view of individual reports
- `Layout.tsx` - Application shell with navigation
- `OverviewCharts.tsx` - Data visualization components

### File Upload Flow

1. User selects XML file in Upload component
2. File is validated using `validateDmarcXml()`
3. XML is parsed using `parseDmarcXml()` from `dmarcParser.ts`
4. Parsed data is stored in Supabase using functions from `dmarcDatabase.ts`
5. Dashboard refreshes to show new data

## Development Guidelines

### TypeScript Configuration
- Uses path aliases (`@/*` maps to `./src/*`)
- Relaxed strictness settings for rapid development
- Separate configs for app and node environments

### Styling
- Uses Tailwind CSS with custom design system
- CSS variables for theme colors in `index.css`
- shadcn/ui components for consistent UI patterns

### State Management
- React Query for server state
- React hooks for local state
- Supabase real-time subscriptions for live updates

### Error Handling
- Comprehensive error handling in data fetching hooks
- User-friendly error messages in UI components
- Validation at both client and server levels

## Testing

Currently no test framework is configured. When adding tests, consider:
- Jest + React Testing Library for component testing
- Cypress or Playwright for E2E testing
- Supabase local development for database testing

## Environment Variables

Required environment variables for Supabase:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Deployment

Built for deployment on Lovable platform with automatic deployment via git push. Can also be deployed to other platforms supporting Vite builds.
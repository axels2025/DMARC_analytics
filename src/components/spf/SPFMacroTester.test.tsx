import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SPFMacroTester } from './SPFMacroTester';

// Mock the macro parser functions
vi.mock('@/utils/spfMacroParser', () => ({
  parseSPFMacros: vi.fn(),
  expandSPFMacro: vi.fn()
}));

describe('SPFMacroTester Component', () => {
  test('should render input fields and test button', () => {
    render(<SPFMacroTester />);

    expect(screen.getByLabelText(/SPF Record/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Sender IP/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Sender Domain/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Local Part/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Test Macros/i })).toBeInTheDocument();
  });

  test('should load example test case when selected', async () => {
    render(<SPFMacroTester />);

    const exampleSelect = screen.getByRole('combobox');
    fireEvent.click(exampleSelect);
    
    await waitFor(() => {
      const basicExampleOption = screen.getByText('Basic Domain Macro');
      fireEvent.click(basicExampleOption);
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue(/include:_spf\.%\{d\}/)).toBeInTheDocument();
    });
  });

  test('should validate required fields before testing', async () => {
    render(<SPFMacroTester />);

    const testButton = screen.getByRole('button', { name: /Test Macros/i });
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(screen.getByText(/Please fill in all required fields/i)).toBeInTheDocument();
    });
  });

  test('should handle macro testing with valid input', async () => {
    const mockParseSPFMacros = vi.fn().mockReturnValue({
      totalMacros: 1,
      macros: [{
        raw: '%{d}',
        type: 'd',
        digits: undefined,
        reverse: false,
        delimiters: [],
        securityRisk: 'low'
      }],
      complexityScore: 10,
      securityRisks: [],
      performanceWarnings: [],
      errors: []
    });

    const mockExpandSPFMacro = vi.fn().mockReturnValue('example.com');

    // Apply mocks
    const { parseSPFMacros, expandSPFMacro } = await import('@/utils/spfMacroParser');
    (parseSPFMacros as any).mockImplementation(mockParseSPFMacros);
    (expandSPFMacro as any).mockImplementation(mockExpandSPFMacro);

    render(<SPFMacroTester />);

    // Fill in form fields
    fireEvent.change(screen.getByLabelText(/SPF Record/i), {
      target: { value: 'v=spf1 include:_spf.%{d} ~all' }
    });
    fireEvent.change(screen.getByLabelText(/Sender IP/i), {
      target: { value: '192.168.1.1' }
    });
    fireEvent.change(screen.getByLabelText(/Sender Domain/i), {
      target: { value: 'example.com' }
    });
    fireEvent.change(screen.getByLabelText(/Local Part/i), {
      target: { value: 'user' }
    });

    // Test macros
    const testButton = screen.getByRole('button', { name: /Test Macros/i });
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(screen.getByText(/Macro Test Results/i)).toBeInTheDocument();
      expect(screen.getByText(/include:_spf\.example\.com/)).toBeInTheDocument();
    });
  });

  test('should display security warnings for high-risk macros', async () => {
    const mockParseSPFMacros = vi.fn().mockReturnValue({
      totalMacros: 1,
      macros: [{
        raw: '%{s}',
        type: 's',
        digits: undefined,
        reverse: false,
        delimiters: [],
        securityRisk: 'high'
      }],
      complexityScore: 30,
      securityRisks: ['Sender domain macro (%{s}) can be spoofed by attackers'],
      performanceWarnings: [],
      errors: []
    });

    const { parseSPFMacros } = await import('@/utils/spfMacroParser');
    (parseSPFMacros as any).mockImplementation(mockParseSPFMacros);

    render(<SPFMacroTester />);

    // Fill in form and test
    fireEvent.change(screen.getByLabelText(/SPF Record/i), {
      target: { value: 'v=spf1 include:%{s}.test.com ~all' }
    });
    fireEvent.change(screen.getByLabelText(/Sender IP/i), {
      target: { value: '192.168.1.1' }
    });
    fireEvent.change(screen.getByLabelText(/Sender Domain/i), {
      target: { value: 'example.com' }
    });
    fireEvent.change(screen.getByLabelText(/Local Part/i), {
      target: { value: 'user' }
    });

    fireEvent.click(screen.getByRole('button', { name: /Test Macros/i }));

    await waitFor(() => {
      expect(screen.getByText(/Security Concerns/i)).toBeInTheDocument();
      expect(screen.getByText(/spoofed by attackers/i)).toBeInTheDocument();
    });
  });

  test('should handle errors gracefully', async () => {
    const mockParseSPFMacros = vi.fn().mockReturnValue({
      totalMacros: 0,
      macros: [],
      complexityScore: 0,
      securityRisks: [],
      performanceWarnings: [],
      errors: ['Invalid macro format: %{invalid}']
    });

    const { parseSPFMacros } = await import('@/utils/spfMacroParser');
    (parseSPFMacros as any).mockImplementation(mockParseSPFMacros);

    render(<SPFMacroTester />);

    // Fill in form with invalid macro
    fireEvent.change(screen.getByLabelText(/SPF Record/i), {
      target: { value: 'v=spf1 include:%{invalid}.test.com ~all' }
    });
    fireEvent.change(screen.getByLabelText(/Sender IP/i), {
      target: { value: '192.168.1.1' }
    });
    fireEvent.change(screen.getByLabelText(/Sender Domain/i), {
      target: { value: 'example.com' }
    });
    fireEvent.change(screen.getByLabelText(/Local Part/i), {
      target: { value: 'user' }
    });

    fireEvent.click(screen.getByRole('button', { name: /Test Macros/i }));

    await waitFor(() => {
      expect(screen.getByText(/Error/i)).toBeInTheDocument();
      expect(screen.getByText(/Invalid macro format/i)).toBeInTheDocument();
    });
  });

  test('should display performance warnings', async () => {
    const mockParseSPFMacros = vi.fn().mockReturnValue({
      totalMacros: 6,
      macros: Array(6).fill({
        raw: '%{i}',
        type: 'i',
        digits: undefined,
        reverse: false,
        delimiters: [],
        securityRisk: 'medium'
      }),
      complexityScore: 60,
      securityRisks: [],
      performanceWarnings: ['6 macros in single mechanism may impact DNS resolution performance'],
      errors: []
    });

    const { parseSPFMacros } = await import('@/utils/spfMacroParser');
    (parseSPFMacros as any).mockImplementation(mockParseSPFMacros);

    render(<SPFMacroTester />);

    // Fill in form
    fireEvent.change(screen.getByLabelText(/SPF Record/i), {
      target: { value: 'v=spf1 exists:%{i}.%{i}.%{i}.%{i}.%{i}.%{i}.test.com ~all' }
    });
    fireEvent.change(screen.getByLabelText(/Sender IP/i), {
      target: { value: '192.168.1.1' }
    });
    fireEvent.change(screen.getByLabelText(/Sender Domain/i), {
      target: { value: 'example.com' }
    });
    fireEvent.change(screen.getByLabelText(/Local Part/i), {
      target: { value: 'user' }
    });

    fireEvent.click(screen.getByRole('button', { name: /Test Macros/i }));

    await waitFor(() => {
      expect(screen.getByText(/Performance Warnings/i)).toBeInTheDocument();
      expect(screen.getByText(/may impact DNS resolution performance/i)).toBeInTheDocument();
    });
  });

  test('should clear results when form is reset', async () => {
    render(<SPFMacroTester />);

    // First add some content and test
    fireEvent.change(screen.getByLabelText(/SPF Record/i), {
      target: { value: 'v=spf1 include:_spf.%{d} ~all' }
    });

    // Clear the form
    fireEvent.click(screen.getByRole('button', { name: /Clear/i }));

    expect(screen.getByLabelText(/SPF Record/i)).toHaveValue('');
    expect(screen.getByLabelText(/Sender IP/i)).toHaveValue('');
    expect(screen.getByLabelText(/Sender Domain/i)).toHaveValue('');
    expect(screen.getByLabelText(/Local Part/i)).toHaveValue('');
  });
});
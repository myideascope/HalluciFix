import { describe, it, expect } from 'vitest';
import { render, screen } from './utils/render';
import { createTestUser } from './factories';

// Simple test component for demonstration
const TestComponent: React.FC<{ message: string; user?: any }> = ({ message, user }) => {
  return (
    <div>
      <h1 data-testid="message">{message}</h1>
      {user && <p data-testid="user-name">Hello, {user.name}!</p>}
    </div>
  );
};

describe('Example Component Test', () => {
  it('should render message correctly', () => {
    render(<TestComponent message="Test Message" />);
    
    expect(screen.getByTestId('message')).toHaveTextContent('Test Message');
  });

  it('should render user information when user is provided', () => {
    const testUser = createTestUser({ name: 'John Doe' });
    
    render(<TestComponent message="Welcome" user={testUser} />);
    
    expect(screen.getByTestId('message')).toHaveTextContent('Welcome');
    expect(screen.getByTestId('user-name')).toHaveTextContent('Hello, John Doe!');
  });

  it('should not render user information when user is not provided', () => {
    render(<TestComponent message="Welcome" />);
    
    expect(screen.getByTestId('message')).toHaveTextContent('Welcome');
    expect(screen.queryByTestId('user-name')).not.toBeInTheDocument();
  });

  it('should work with custom render providers', () => {
    const testUser = createTestUser({ name: 'Jane Smith' });
    
    render(<TestComponent message="Dashboard" user={testUser} />, {
      initialUser: testUser
    });
    
    // Verify the mock providers are working
    expect(screen.getByTestId('mock-auth-provider')).toBeInTheDocument();
    expect(screen.getByTestId('mock-toast-provider')).toBeInTheDocument();
    expect(screen.getByTestId('mock-theme-provider')).toBeInTheDocument();
  });
});
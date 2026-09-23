import { Container, Typography } from '@mui/material';

export function NotAuthorisedPage() {
  return (
    <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
      <Typography variant="h4" gutterBottom>
        Not authorised
      </Typography>
      <Typography color="text.secondary">You don&apos;t have permission to view this page.</Typography>
    </Container>
  );
}

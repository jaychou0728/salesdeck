import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Dashboard } from "./pages/Dashboard";
import { Customers } from "./pages/Customers";
import { CustomerDetail } from "./pages/CustomerDetail";
import { Opportunities } from "./pages/Opportunities";
import { OpportunityDetail } from "./pages/OpportunityDetail";
import { Inventory } from "./pages/Inventory";
import { Quotes } from "./pages/Quotes";
import { QuoteNew } from "./pages/QuoteNew";
import { QuoteDetail } from "./pages/QuoteDetail";
import { Orders } from "./pages/Orders";
import { OrderDetail } from "./pages/OrderDetail";
import { Tickets } from "./pages/Tickets";
import { TicketDetail } from "./pages/TicketDetail";
import { Approvals } from "./pages/Approvals";
import { Audit } from "./pages/Audit";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/opportunities" element={<Opportunities />} />
        <Route path="/opportunities/:id" element={<OpportunityDetail />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/quotes" element={<Quotes />} />
        <Route path="/quotes/new" element={<QuoteNew />} />
        <Route path="/quotes/:id" element={<QuoteDetail />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/tickets" element={<Tickets />} />
        <Route path="/tickets/:id" element={<TicketDetail />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

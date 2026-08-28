import { Route, Routes } from "react-router-dom";
import { TopNav } from "./components/TopNav";
import { HomePage } from "./pages/HomePage";
import { PickIntroPage } from "./pages/PickIntroPage";
import { PickTimePage } from "./pages/PickTimePage";

export function App() {
	return (
		<>
			<TopNav />
			<Routes>
				<Route path="/" element={<HomePage />} />
				<Route path="/pick" element={<PickIntroPage />} />
				<Route path="/pick/:pollId" element={<PickTimePage />} />
			</Routes>
		</>
	);
}

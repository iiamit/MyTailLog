import { sectionLanding } from "@/lib/v2/landing";

const landing = sectionLanding("logbooks");
export const generateMetadata = landing.generateMetadata;
export default landing.Page;

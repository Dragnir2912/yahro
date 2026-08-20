import BudgetDashboard from "@/components/ui/saa-s-template";

export default function Demo() {
  return <BudgetDashboard profile={{ id: "demo-user", email: "ariel@example.com", firstName: "Ariël", lastName: "Hermas Yapi", nickname: "Ariël", avatarKey: "sage", profilePhotoData: null, countryCode: "CI", locale: "fr", timezone: "Africa/Abidjan", defaultCurrency: "XOF" }} />;
}

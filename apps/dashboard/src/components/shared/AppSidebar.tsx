import { styled, Sidebar, Flex, TreeItem, TreeItemsContainer } from "@scute/ui";
import { CgPoll, CgUserList, CgBolt, CgBrackets, CgUser } from "react-icons/cg";
import { TbBrightness2 } from "react-icons/tb";
import { useRouter } from "next/router";
import Link from "next/link";

export const AppSidebar = () => {
  const router = useRouter();

  const app_id = router.query.uid;
  const list = [
    {
      name: "Dashboard",
      slug: "",
      href: `/apps/${app_id}/`,
      icon: CgPoll,
    },
    {
      name: "Users",
      slug: "/users",
      href: `/apps/${app_id}/users`,
      icon: CgUser,
    },
    {
      name: "Activity",
      slug: "/activity",
      href: `/apps/${app_id}/activity`,
      icon: CgBolt,
    },
    {
      name: "API Keys",
      slug: "/api-keys",
      href: `/apps/${app_id}/api-keys`,
      icon: CgBrackets,
    },
    {
      name: "Team",
      slug: "/team",
      href: `/apps/${app_id}/team`,
      icon: CgUserList,
    },
    {
      name: "Settings",
      slug: "/settings",
      href: `/apps/${app_id}/settings`,
      icon: TbBrightness2,
    },
  ];
  const path = router.asPath.replace(`/apps/${app_id}`, "");
  return (
    <Sidebar>
      <TreeItemsContainer css={{ mt: "$4" }}>
        {list.map((item, index) => {
          const Icon = item.icon;
          return (
            <Link href={item.href} key={index}>
              <TreeItem data-active={path === item.slug ? true : false}>
                <Flex css={{ ai: "center", gap: "$2" }}>
                  <Icon size={18} color={"#666"} />
                  {item.name}
                </Flex>
              </TreeItem>
            </Link>
          );
        })}
      </TreeItemsContainer>
    </Sidebar>
  );
};

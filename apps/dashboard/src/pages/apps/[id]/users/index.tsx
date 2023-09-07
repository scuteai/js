import {
  Flex,
  Container,
  Text,
  IconButton,
  Button,
  Card,
  Badge,
  Kbd,
  TextField,
  Tooltip,
  DropdownMenu,
} from "@radix-ui/themes";
import { Layout } from "@/components/shared/Layout";
import { useState, useReducer } from "react";
import styles from "@/styles/Table.module.scss";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  CopyIcon,
  DotsHorizontalIcon,
  EyeOpenIcon,
  MagnifyingGlassIcon,
} from "@radix-ui/react-icons";
import { shortString } from "@/utils/string";
import Link from "next/link";
import { useRouter } from "next/router";
import { ScuteUser } from "@/types/user";


const exampleData: ScuteUser[] = [
  {
    id: "e240303b-e261-416f-b0af-7d70239125f7",
    fullName: "tanner linsley adfafdafad",
    email: "t@linsley.com",
    status: "deactive",
    lastLogin: "2021-01-01",
    signupDate: "2021-01-01",
  },
  {
    id: "e240303b-e261-416f-b0af-7d70239125f7",
    fullName: "mtanner zlinsley",
    email: "t@linsley.com",
    status: "active",
    lastLogin: "2021-01-01",
    signupDate: "2021-01-01",
  },
];

const columnHelper = createColumnHelper<ScuteUser>();

type AppUserActionsProps = {
  user: ScuteUser;
};

const AppUserActions = ({ user }: AppUserActionsProps) => {
  const router = useRouter();
  const appId = router.query.id;

  const userUrl = `/apps/${appId}/users/${user.id}`;

  return (
    <Flex gap="3" align="center" justify="end">
      <Badge radius="full" color={user.status === "active" ? "green" : "red"}>
        {user.status}
      </Badge>
      <Flex gap="2" align="center">
        <Link href={userUrl}>
          <IconButton color="gray" size="1" variant="ghost">
            <EyeOpenIcon />
          </IconButton>
        </Link>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <IconButton color="gray" size="1" variant="ghost">
              <DotsHorizontalIcon />
            </IconButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <Link legacyBehavior href={userUrl}>
              <DropdownMenu.Item shortcut="⌘ V">View</DropdownMenu.Item>
            </Link>
            {user.status === "active" ? (
              <DropdownMenu.Item shortcut="⌘ D">Deactivate</DropdownMenu.Item>
            ) : (
              <DropdownMenu.Item shortcut="⌘ A">Activate</DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </Flex>
    </Flex>
  );
};

const columns = [
  columnHelper.accessor("id", {
    cell: (info) => (
      <Flex gap="1">
        <Tooltip content={info.getValue()}>
          <Kbd size="1">{shortString(info.getValue(), 8)}</Kbd>
        </Tooltip>
        <IconButton color="gray" size="1" variant="ghost">
          <CopyIcon />
        </IconButton>
      </Flex>
    ),
    header: () => <span>User ID</span>,
  }),
  columnHelper.accessor("fullName", {}),
  columnHelper.accessor("email", {
    header: () => <span>Email</span>,
  }),
  columnHelper.accessor("lastLogin", {
    header: () => <span>Last login</span>,
  }),
  columnHelper.accessor("signupDate", {
    header: () => <span>Signup date</span>,
  }),
  columnHelper.accessor("status", {
    cell: (props) => <AppUserActions user={props.row.original} />,
    header: () => <span>Status</span>,
  }),
];

export default function AppUsers() {
  const [data, setData] = useState(() => [...exampleData]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Layout
      titleBarContent={
        <Flex gap="3" justify="end">
          <TextField.Root>
            <TextField.Slot>
              <MagnifyingGlassIcon height="16" width="16" />
            </TextField.Slot>
            <TextField.Input placeholder="Search users" />
          </TextField.Root>
          <Button variant="outline">Create new user</Button>
          <Button variant="outline" color="gray">
            Import users
          </Button>
        </Flex>
      }
    >
      <Container size="3">
        <table className={styles.table}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    className={styles.th}
                  >
                    {header.isPlaceholder ? null : (
                      <div
                        {...{
                          className: header.column.getCanSort()
                            ? "cursor-pointer select-none"
                            : "",
                          onClick: header.column.getToggleSortingHandler(),
                        }}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {{
                          asc: " 🔼",
                          desc: " 🔽",
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className={styles.tbody}>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={styles.tr}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={styles.td}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Container>
    </Layout>
  );
}

"use client";

import Link from "next/link";
import {
  Flex,
  Container,
  IconButton,
  Badge,
  Kbd,
  Tooltip,
  DropdownMenu,
} from "@radix-ui/themes";
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
} from "@radix-ui/react-icons";
import { shortString } from "@/utils/string";
import type { ScuteUser } from "@/types/user";

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
  appId: string;
  user: ScuteUser;
};

const AppUserActions = ({ appId, user }: AppUserActionsProps) => {
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

export default function AppUsers({ params }: { params: { id: string } }) {
  const appId = params.id;

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
      cell: (props) => (
        <AppUserActions appId={appId} user={props.row.original} />
      ),
      header: () => <span>Status</span>,
    }),
  ];

  const table = useReactTable({
    data: exampleData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
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
  );
}

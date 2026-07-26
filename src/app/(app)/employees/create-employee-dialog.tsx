"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { apiSend, apiUpload } from "@/lib/fetcher";
import { ROLE_META } from "@/lib/rbac";
import { useCan } from "@/components/session-context";
import { JobDescriptionUpload } from "@/components/job-description-upload";

const schema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  email: z.string().email("Invalid email"),
  roleKey: z.string().min(1, "Required"),
  jobTitle: z.string().optional(),
  departmentId: z.string().optional(),
  managerId: z.string().optional(),
  password: z.string().min(8, "Min 8 characters"),
});
type FormValues = z.infer<typeof schema>;

export function CreateEmployeeDialog({
  open,
  onClose,
  departments,
  employees,
}: {
  open: boolean;
  onClose: () => void;
  departments: { id: string; name: string }[];
  employees: { id: string; name: string }[];
}) {
  const qc = useQueryClient();
  const can = useCan();
  const canUploadJd = can("JobDescription.Upload");
  const [jobDescription, setJobDescription] = React.useState<File | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      // Only switch to multipart when there is actually a file — a plain JSON
      // create stays on the existing path.
      if (!jobDescription) return apiSend<any>("/api/employees", "POST", values);
      const form = new FormData();
      form.append("payload", JSON.stringify(values));
      form.append("jobDescription", jobDescription);
      return apiUpload<any>("/api/employees", form);
    },
    onSuccess: (res: any) => {
      // The account can succeed while the document fails; surface that rather
      // than reporting a clean success.
      if (res?.warning) toast.warning(res.warning);
      else toast.success(jobDescription ? "Employee added with job description" : "Employee added");
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["job-descriptions"] });
      reset();
      setJobDescription(null);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onClose={onClose} title="Add employee" description="Create a new team member account.">
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" error={errors.firstName?.message}>
            <Input {...register("firstName")} />
          </Field>
          <Field label="Last name" error={errors.lastName?.message}>
            <Input {...register("lastName")} />
          </Field>
        </div>
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" {...register("email")} placeholder="name@elenor.com" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Role" error={errors.roleKey?.message}>
            <Select {...register("roleKey")} defaultValue="">
              <option value="" disabled>Select role</option>
              {Object.entries(ROLE_META).map(([key, meta]) => (
                <option key={key} value={key}>{meta.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Job title">
            <Input {...register("jobTitle")} placeholder="e.g. Senior Designer" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Department">
            <Select {...register("departmentId")} defaultValue="">
              <option value="">None</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Manager">
            <Select {...register("managerId")} defaultValue="">
              <option value="">None</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Temporary password" error={errors.password?.message}>
          <Input type="text" {...register("password")} />
        </Field>

        {canUploadJd && (
          <div className="space-y-2 border-t border-border pt-4">
            <div>
              <Label>Job Description</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Optional. The employee will be asked to read and acknowledge it.
              </p>
            </div>
            <JobDescriptionUpload
              file={jobDescription}
              onChange={setJobDescription}
              disabled={mutation.isPending}
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Create employee
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

# Product Specification

## Purpose

VacTech Service Portal is a standalone digital service record for customer equipment. VacTech employees document service work orders; authorized customers securely follow their own equipment's progress, updates, photos, documents, and history. Equipment is the persistent asset, while each work order is an individual service event.

## Users

- Portal Administrators manage application access and administration.
- VacTech Managers manage work orders, equipment, customers, users, and access requests.
- VacTech Service Users document work, updates, findings, photos, documents, and permitted stage changes.
- Customer Users have read-only access to customer-visible records for their authorized company.

## MVP Scope

The MVP includes company/location management, deliberate customer access approval, equipment and work-order history, configurable service stages and separate conditions, updates/findings/attachments with visibility, bulk categorized photos with optimized gallery assets, customer dashboards/detail pages, search, notifications, audit history, and responsive internal/customer layouts.

Excluded: ERP/FSM integrations, payments, quote approval workflows, chat, AI, carrier APIs, advanced analytics, native apps, microservices, customer-managed organizations, and a large configurable permissions engine.

## First Vertical Slice

Implement and prove Company -> Equipment -> Work Order -> Customer-visible Update -> Customer Work Order View. Add customer-visible photo upload and viewing only after this data and authorization path is clean.
